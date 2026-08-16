using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace MergeCom.DocumentEngine.Tests;

public sealed class InspectionTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Token = "mergecom-local-document-engine-token";
    private readonly WebApplicationFactory<Program> _factory;

    public InspectionTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("presentation")]
    [InlineData("spreadsheet")]
    [InlineData("word_document")]
    public void ValidPackagesProduceVersionedDeterministicSnapshots(string fileType)
    {
        using var fixture = fileType switch
        {
            "presentation" => SyntheticOfficePackage.Presentation(),
            "spreadsheet" => SyntheticOfficePackage.Spreadsheet(),
            _ => SyntheticOfficePackage.Word(),
        };
        var options = new InspectionOptions();
        var sha256 = Convert.ToHexStringLower(SHA256.HashData(fixture.Bytes));
        var first = new OoxmlInspector(options).Inspect(fixture.Path, fileType, sha256);
        var second = new OoxmlInspector(options).Inspect(fixture.Path, fileType, sha256);

        Assert.Equal("completed", first.Outcome);
        Assert.Equal("1.0.0", first.Snapshot.SchemaVersion);
        Assert.Equal("1.0.0", first.Snapshot.ParserVersion);
        Assert.Equal(first.Snapshot.StableHash, second.Snapshot.StableHash);
        Assert.Equal(64, first.Snapshot.StableHash.Length);
        Assert.True(first.Snapshot.Package.EntryCount > 0);
    }

    [Fact]
    public void MacrosSignaturesExternalLinksAndEmbeddedObjectsAreDetectedWithoutExecution()
    {
        using var macro = SyntheticOfficePackage.WordWithFeature("word/vbaProject.bin", [1, 2, 3]);
        using var signature = SyntheticOfficePackage.WordWithFeature("_xmlsignatures/sig1.xml", "<Signature />"u8.ToArray());
        using var embedded = SyntheticOfficePackage.WordWithFeature("word/embeddings/oleObject1.bin", [1, 2, 3]);
        using var external = SyntheticOfficePackage.WordWithExternalRelationship();

        AssertFeature(macro, "vba_macros", package => package.HasMacros);
        AssertFeature(signature, "digital_signatures", package => package.HasDigitalSignatures);
        AssertFeature(embedded, "embedded_objects", package => package.HasEmbeddedObjects);
        AssertFeature(external, "external_links", package => package.HasExternalLinks);
    }

    [Theory]
    [InlineData("../payload.xml", "package_path_traversal")]
    [InlineData("%2e%2e/payload.xml", "package_path_traversal")]
    [InlineData("/absolute.xml", "package_path_traversal")]
    [InlineData("word\\payload.xml", "package_path_traversal")]
    [InlineData("word%5cpayload.xml", "package_path_traversal")]
    public void UnsafePartNamesAreQuarantined(string partName, string expectedCode)
    {
        using var fixture = SyntheticOfficePackage.WithEntry(partName, "<safe />"u8.ToArray());
        var result = Inspect(fixture);
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal(expectedCode, result.FailureCode);
    }

    [Fact]
    public void DtdIsQuarantinedBeforeTheSdkReadsThePackage()
    {
        using var fixture = SyntheticOfficePackage.WithEntry(
            "word/document.xml",
            "<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///etc/passwd'>]><x>&e;</x>"u8.ToArray());
        var result = Inspect(fixture);
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("xml_dtd_forbidden", result.FailureCode);
    }

    [Fact]
    public void CompressionBombRatioIsQuarantined()
    {
        using var fixture = SyntheticOfficePackage.WithEntry("word/bomb.bin", new byte[1024 * 1024]);
        var result = new OoxmlInspector(new InspectionOptions { MaxCompressionRatio = 10 })
            .Inspect(fixture.Path, "word_document", Hash(fixture.Bytes));
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("package_compression_ratio", result.FailureCode);
    }

    [Fact]
    public void OversizedExpandedPartIsQuarantined()
    {
        using var fixture = SyntheticOfficePackage.WithEntry("word/large.bin", new byte[1_024]);
        var result = new OoxmlInspector(new InspectionOptions { MaxPartBytes = 100 })
            .Inspect(fixture.Path, "word_document", Hash(fixture.Bytes));
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("package_part_limit", result.FailureCode);
    }

    [Fact]
    public void EncryptedPackageIsQuarantinedBeforeAnyPartIsOpened()
    {
        using var fixture = SyntheticOfficePackage.Encrypted();
        var result = Inspect(fixture);
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("package_encrypted", result.FailureCode);
    }

    [Fact]
    public void ExcessivePartCountIsQuarantined()
    {
        using var fixture = SyntheticOfficePackage.WithEntry("word/document.xml", "<document />"u8.ToArray());
        var result = new OoxmlInspector(new InspectionOptions { MaxEntries = 2 })
            .Inspect(fixture.Path, "word_document", Hash(fixture.Bytes));
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("package_entry_limit", result.FailureCode);
    }

    [Fact]
    public void ExcessiveXmlDepthIsQuarantined()
    {
        using var fixture = SyntheticOfficePackage.WithEntry(
            "word/document.xml",
            "<a><b><c><d><e /></d></c></b></a>"u8.ToArray());
        var result = new OoxmlInspector(new InspectionOptions { MaxXmlDepth = 3 })
            .Inspect(fixture.Path, "word_document", Hash(fixture.Bytes));
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("xml_depth_limit", result.FailureCode);
    }

    [Fact]
    public void RelationshipTargetCannotEscapeThePackageRoot()
    {
        using var fixture = SyntheticOfficePackage.WordWithRootRelationships(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="../outside.xml" />
            </Relationships>
            """);
        var result = Inspect(fixture);
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("relationship_path_traversal", result.FailureCode);
    }

    [Fact]
    public void RelationshipTargetCannotUseBackslashSeparators()
    {
        using var fixture = SyntheticOfficePackage.WordWithRootRelationships(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word\document.xml" />
            </Relationships>
            """);
        var result = Inspect(fixture);
        Assert.Equal("quarantined", result.Outcome);
        Assert.Equal("relationship_target_unsafe", result.FailureCode);
    }

    [Fact]
    public void MalformedContentTypeDeclarationFailsPermanently()
    {
        using var fixture = SyntheticOfficePackage.WordWithContentTypes(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
              <Default Extension="" ContentType="application/xml" />
            </Types>
            """);
        var result = Inspect(fixture);
        Assert.Equal("permanently_failed", result.Outcome);
        Assert.Equal("content_types_malformed", result.FailureCode);
    }

    [Fact]
    public void CorruptPackageFailsPermanentlyWithoutEscapingTheBoundary()
    {
        using var fixture = SyntheticOfficePackage.Corrupt();
        var result = Inspect(fixture);
        Assert.Equal("permanently_failed", result.Outcome);
        Assert.Equal("package_corrupt", result.FailureCode);
    }

    [Fact]
    public async Task InternalEndpointRequiresAuthenticationAndReturnsSnakeCaseSnapshot()
    {
        using var fixture = SyntheticOfficePackage.Word();
        using var client = _factory.CreateClient();
        using var unauthorized = await client.PostAsync(
            "/internal/v1/inspections",
            new ByteArrayContent(fixture.Bytes));
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        using var request = Request(fixture);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("completed", json.RootElement.GetProperty("outcome").GetString());
        Assert.Equal("1.0.0", json.RootElement.GetProperty("snapshot").GetProperty("schema_version").GetString());
        var tempRoot = new InspectionOptions().TempRoot;
        Assert.Empty(Directory.EnumerateDirectories(tempRoot, "inspection-*"));
    }

    private static HttpRequestMessage Request(SyntheticOfficePackage fixture)
    {
        var bytes = fixture.Bytes;
        var request = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/inspections")
        {
            Content = new ByteArrayContent(bytes),
        };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        request.Headers.Add("X-MergeCom-Internal-Token", Token);
        request.Headers.Add("X-MergeCom-File-Type", "word_document");
        request.Headers.Add("X-MergeCom-Extension", ".docx");
        request.Headers.Add("X-MergeCom-Source-Sha256", Hash(bytes));
        request.Headers.Add("X-MergeCom-Trace-Id", Guid.NewGuid().ToString());
        return request;
    }

    private static InspectionResult Inspect(SyntheticOfficePackage fixture)
        => new OoxmlInspector(new InspectionOptions())
            .Inspect(fixture.Path, "word_document", Hash(fixture.Bytes));

    private static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

    private static void AssertFeature(
        SyntheticOfficePackage fixture,
        string expectedFeature,
        Func<PackageSummary, bool> packagePredicate)
    {
        var result = Inspect(fixture);
        Assert.Equal("completed", result.Outcome);
        Assert.True(packagePredicate(result.Snapshot.Package));
        Assert.Contains(expectedFeature, result.Snapshot.UnsupportedFeatures);
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace MergeCom.DocumentEngine.Tests;

public sealed class ComparisonTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Token = "mergecom-local-document-engine-token";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };
    private readonly WebApplicationFactory<Program> factory;

    public ComparisonTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public void IdenticalCompleteSnapshotsAreByteAndSemanticallyEqual()
    {
        using var fixture = SyntheticOfficePackage.Word();
        var snapshot = Inspect(fixture);
        var comparator = new OoxmlComparator();

        Assert.Empty(snapshot.UnsupportedFeatures);
        Assert.Empty(snapshot.ValidationErrors);

        var first = comparator.Compare(snapshot, snapshot);
        var second = comparator.Compare(snapshot, snapshot);

        Assert.True(first.ByteEqual);
        Assert.True(first.SemanticEqual);
        Assert.Equal("complete", first.Completeness);
        Assert.Empty(first.Changes);
        Assert.Equal(first.StableHash, second.StableHash);
    }

    [Fact]
    public void ChangedWordTextProducesAStableTypedContentChange()
    {
        using var before = SyntheticOfficePackage.Word("Quarterly revenue");
        using var after = SyntheticOfficePackage.Word("Annual revenue");
        var comparator = new OoxmlComparator();

        var result = comparator.Compare(Inspect(before), Inspect(after));

        Assert.False(result.ByteEqual);
        Assert.False(result.SemanticEqual);
        var change = Assert.Single(result.Changes);
        Assert.Equal("modified", change.ChangeType);
        Assert.Equal("content", change.Category);
        Assert.Equal("Quarterly revenue", change.Before);
        Assert.Equal("Annual revenue", change.After);
    }

    [Fact]
    public void ChangedNestedWordTableTextProducesAContentChange()
    {
        using var before = SyntheticOfficePackage.WordWithNestedTable("Original nested value");
        using var after = SyntheticOfficePackage.WordWithNestedTable("Updated nested value");

        var result = new OoxmlComparator().Compare(Inspect(before), Inspect(after));

        Assert.False(result.SemanticEqual);
        Assert.Contains(result.Changes, change =>
            change.Category == "content"
            && change.Before == "Original nested value"
            && change.After == "Updated nested value");
    }

    [Theory]
    [InlineData("presentation")]
    [InlineData("spreadsheet")]
    public void ChangedOfficeContentProducesTypedChanges(string fileType)
    {
        using var before = fileType == "presentation"
            ? SyntheticOfficePackage.Presentation("Draft forecast")
            : SyntheticOfficePackage.Spreadsheet("7");
        using var after = fileType == "presentation"
            ? SyntheticOfficePackage.Presentation("Final forecast")
            : SyntheticOfficePackage.Spreadsheet("9");

        var result = new OoxmlComparator().Compare(
            Inspect(before, fileType),
            Inspect(after, fileType));

        Assert.False(result.SemanticEqual);
        Assert.Contains(result.Changes, change =>
            change.Category == "content" && change.ChangeType == "modified");
    }

    [Fact]
    public void UnsupportedFeaturesPreventAnUnqualifiedEqualityClaim()
    {
        using var macro = SyntheticOfficePackage.WordWithFeature("word/vbaProject.bin", [1, 2, 3]);
        var snapshot = Inspect(macro);

        var result = new OoxmlComparator().Compare(snapshot, snapshot);

        Assert.True(result.ByteEqual);
        Assert.Null(result.SemanticEqual);
        Assert.Equal("partial", result.Completeness);
        Assert.Contains(result.Warnings, warning => warning.Contains("vba_macros", StringComparison.Ordinal));
    }

    [Fact]
    public async Task InternalEndpointRequiresAuthenticationAndReturnsSnakeCaseResult()
    {
        using var fixture = SyntheticOfficePackage.Word();
        var snapshot = Inspect(fixture);
        using var client = factory.CreateClient();
        using var unauthorized = await client.PostAsJsonAsync(
            "/internal/v1/comparisons",
            new SnapshotComparisonRequest(snapshot, snapshot),
            JsonOptions);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/comparisons")
        {
            Content = JsonContent.Create(
                new SnapshotComparisonRequest(snapshot, snapshot),
                options: JsonOptions),
        };
        request.Headers.Add("X-MergeCom-Internal-Token", Token);
        request.Headers.Add("X-MergeCom-Trace-Id", Guid.NewGuid().ToString());
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("1.0.0", json.RootElement.GetProperty("comparison_schema_version").GetString());
        Assert.True(json.RootElement.GetProperty("semantic_equal").GetBoolean());
    }

    [Fact]
    public async Task InternalEndpointRejectsMissingSnapshots()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/comparisons")
        {
            Content = JsonContent.Create(new { }),
        };
        request.Headers.Add("X-MergeCom-Internal-Token", Token);
        request.Headers.Add("X-MergeCom-Trace-Id", Guid.NewGuid().ToString());

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static SnapshotEnvelope Inspect(
        SyntheticOfficePackage fixture,
        string fileType = "word_document")
    {
        var bytes = fixture.Bytes;
        var sha256 = Convert.ToHexStringLower(SHA256.HashData(bytes));
        return new OoxmlInspector(new InspectionOptions())
            .Inspect(fixture.Path, fileType, sha256)
            .Snapshot;
    }
}

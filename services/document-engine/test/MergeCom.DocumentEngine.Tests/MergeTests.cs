using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml.Packaging;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;
using W = DocumentFormat.OpenXml.Wordprocessing;

namespace MergeCom.DocumentEngine.Tests;

public sealed class MergeTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Token = "mergecom-local-document-engine-token";
    private readonly WebApplicationFactory<Program> factory;

    public MergeTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public void DisjointWordTextChangesProduceAValidatedUnion()
    {
        using var basis = SyntheticOfficePackage.WordParagraphs("Revenue draft", "Risk draft");
        using var ours = SyntheticOfficePackage.WordParagraphs("Revenue final", "Risk draft");
        using var theirs = SyntheticOfficePackage.WordParagraphs("Revenue draft", "Risk final");
        var candidatePath = Path.Combine(Path.GetTempPath(), $"candidate-{Guid.NewGuid():N}.docx");
        try
        {
            var result = Merger().Merge(
                basis.Path,
                ours.Path,
                theirs.Path,
                "word_document",
                Sha256(basis.Bytes),
                Sha256(ours.Bytes),
                Sha256(theirs.Bytes),
                candidatePath);

            Assert.Equal("completed", result.Outcome);
            Assert.Equal("disjoint_word_text", result.Strategy);
            Assert.Single(result.AppliedPaths);
            Assert.NotNull(result.CandidateBytes);
            using var candidate = WordprocessingDocument.Open(
                new MemoryStream(result.CandidateBytes!),
                false);
            var body = candidate.MainDocumentPart?.Document?.Body;
            Assert.NotNull(body);
            Assert.Equal(
                ["Revenue final", "Risk final"],
                body.Elements<W.Paragraph>()
                    .Select(paragraph => paragraph.InnerText));
        }
        finally
        {
            File.Delete(candidatePath);
        }
    }

    [Fact]
    public void OverlappingWordChangesRequireManualResolution()
    {
        using var basis = SyntheticOfficePackage.WordParagraphs("Revenue draft", "Risk draft");
        using var ours = SyntheticOfficePackage.WordParagraphs("Revenue approved", "Risk draft");
        using var theirs = SyntheticOfficePackage.WordParagraphs("Revenue revised", "Risk draft");
        var result = Merger().Merge(
            basis.Path,
            ours.Path,
            theirs.Path,
            "word_document",
            Sha256(basis.Bytes),
            Sha256(ours.Bytes),
            Sha256(theirs.Bytes),
            Path.Combine(Path.GetTempPath(), $"candidate-{Guid.NewGuid():N}.docx"));

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("merge_changes_overlap", result.FailureCode);
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void DivergentSpreadsheetChangesRequireManualResolution()
    {
        using var basis = SyntheticOfficePackage.Spreadsheet("1");
        using var ours = SyntheticOfficePackage.Spreadsheet("2");
        using var theirs = SyntheticOfficePackage.Spreadsheet("3");
        var result = Merger().Merge(
            basis.Path,
            ours.Path,
            theirs.Path,
            "spreadsheet",
            Sha256(basis.Bytes),
            Sha256(ours.Bytes),
            Sha256(theirs.Bytes),
            Path.Combine(Path.GetTempPath(), $"candidate-{Guid.NewGuid():N}.xlsx"));

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("merge_format_requires_manual_resolution", result.FailureCode);
    }

    [Fact]
    public void ChangedUnmodeledPackagePartRequiresManualResolution()
    {
        using var basis = SyntheticOfficePackage.Word("Base");
        using var ours = SyntheticOfficePackage.WordWithFeature(
            "customXml/item1.xml",
            "<item>ours</item>"u8.ToArray(),
            "Ours");
        using var theirs = SyntheticOfficePackage.Word("Theirs");
        var result = Merger().Merge(
            basis.Path,
            ours.Path,
            theirs.Path,
            "word_document",
            Sha256(basis.Bytes),
            Sha256(ours.Bytes),
            Sha256(theirs.Bytes),
            Path.Combine(Path.GetTempPath(), $"candidate-{Guid.NewGuid():N}.docx"));

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.FailureCode, new[]
        {
            "merge_coverage_incomplete",
            "merge_supporting_parts_changed",
        });
    }

    [Fact]
    public async Task InternalEndpointRequiresAuthenticationAndChecksFraming()
    {
        using var basis = SyntheticOfficePackage.WordParagraphs("A", "B");
        using var ours = SyntheticOfficePackage.WordParagraphs("A1", "B");
        using var theirs = SyntheticOfficePackage.WordParagraphs("A", "B1");
        using var client = factory.CreateClient();
        using var unauthorized = await client.PostAsJsonAsync("/internal/v1/merges", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        var body = basis.Bytes.Concat(ours.Bytes).Concat(theirs.Bytes).ToArray();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/merges")
        {
            Content = new ByteArrayContent(body),
        };
        request.Headers.Add("X-MergeCom-Internal-Token", Token);
        request.Headers.Add("X-MergeCom-Trace-Id", Guid.NewGuid().ToString());
        request.Headers.Add("X-MergeCom-File-Type", "word_document");
        request.Headers.Add("X-MergeCom-Extension", ".docx");
        request.Headers.Add("X-MergeCom-Base-Sha256", Sha256(basis.Bytes));
        request.Headers.Add("X-MergeCom-Ours-Sha256", Sha256(ours.Bytes));
        request.Headers.Add("X-MergeCom-Theirs-Sha256", Sha256(theirs.Bytes));
        request.Headers.Add("X-MergeCom-Base-Size", basis.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Ours-Size", ours.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Theirs-Size", theirs.Bytes.Length.ToString());

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("completed", json.RootElement.GetProperty("outcome").GetString());
        Assert.Equal("1.0.0", json.RootElement.GetProperty("merge_schema_version").GetString());
        Assert.True(json.RootElement.GetProperty("candidate_bytes").GetString()!.Length > 0);
    }

    private static OoxmlMerger Merger()
    {
        var options = new InspectionOptions();
        return new(options, new OoxmlComparator());
    }

    private static string Sha256(byte[] bytes)
        => Convert.ToHexStringLower(SHA256.HashData(bytes));
}

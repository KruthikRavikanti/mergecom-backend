using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.IO.Compression;
using DocumentFormat.OpenXml.Packaging;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;
using W = DocumentFormat.OpenXml.Wordprocessing;
using P = DocumentFormat.OpenXml.Presentation;
using S = DocumentFormat.OpenXml.Spreadsheet;

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
    public void SameExcelCellConflictRequiresManualResolution()
    {
        using var basis = SyntheticOfficePackage.Spreadsheet("1");
        using var ours = SyntheticOfficePackage.Spreadsheet("2");
        using var theirs = SyntheticOfficePackage.Spreadsheet("3");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("excel_changes_conflict", result.FailureCode);
        Assert.Equal(1, result.Analysis.Summary["true_conflict"]);
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void EligibleExcelChangesRemainManualWhenKillSwitchIsOff()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, false);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("excel_automatic_merge_disabled", result.FailureCode);
        Assert.True(result.Analysis.AutomaticMergeEligible);
        Assert.False(result.Analysis.AutomaticMergeEnabled);
        Assert.All(result.Analysis.Items, item => Assert.False(item.AutomaticallyResolved));
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void SameWorksheetDisjointExcelCellsProduceValidatedCandidate()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("completed", result.Outcome);
        Assert.Equal("disjoint_excel_cells", result.Strategy);
        Assert.Equal(2, result.Analysis.Summary["non_overlapping"]);
        Assert.All(result.Analysis.Items, item => Assert.True(item.AutomaticallyResolved));
        Assert.Equal(["2", "20"], SpreadsheetValues(result.CandidateBytes!));
    }

    [Fact]
    public void CompatibleExcelOverlapAndDisjointCellProduceValidatedCandidate()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("2", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("completed", result.Outcome);
        Assert.Equal("disjoint_excel_cells", result.Strategy);
        Assert.Equal(1, result.Analysis.Summary["compatible_overlap"]);
        Assert.Equal(1, result.Analysis.Summary["non_overlapping"]);
        Assert.Equal(["2", "20"], SpreadsheetValues(result.CandidateBytes!));
    }

    [Fact]
    public void DisjointExcelWorksheetsProduceValidatedCandidate()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetSheets(["1"], ["10"]);
        using var ours = SyntheticOfficePackage.SpreadsheetSheets(["2"], ["10"]);
        using var theirs = SyntheticOfficePackage.SpreadsheetSheets(["1"], ["20"]);
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("completed", result.Outcome);
        Assert.Equal("disjoint_excel_worksheets", result.Strategy);
        Assert.Equal(["2", "20"], SpreadsheetValues(result.CandidateBytes!));
    }

    [Fact]
    public void ExcelWorksheetStructureChangesRequireManualResolution()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10");
        using (var document = SpreadsheetDocument.Open(ours.Path, true))
        {
            document.WorkbookPart!.WorksheetParts.Single().Worksheet!
                .Descendants<S.Row>().Single().Hidden = true;
        }
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("excel_worksheet_structure_changed", result.FailureCode);
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void ExcelCandidatePreservesEveryUntouchedPartByteForByte()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);
        var oursParts = PackageHashes(ours.Bytes);
        var candidateParts = PackageHashes(result.CandidateBytes!);

        Assert.Equal(oursParts.Keys.Order(), candidateParts.Keys.Order());
        foreach (var part in oursParts.Keys.Where(part => part != "xl/worksheets/sheet1.xml"))
        {
            Assert.True(
                oursParts[part] == candidateParts[part],
                $"Untouched part changed: {part}");
        }
    }

    [Fact]
    public void ExcelFormulaChangesRequireManualResolution()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetFormula("1+1", "2", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetFormula("1+2", "3", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetFormula("1+1", "2", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.Analysis.Items, item => item.Category == "formula");
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void AddedExcelCellRequiresManualResolution()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10", "30");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.FailureCode, new[]
        {
            "excel_change_unsupported",
            "excel_cell_match_ambiguous",
        });
        Assert.Null(result.CandidateBytes);
    }

    [Theory]
    [InlineData("xl/styles.xml", "style")]
    [InlineData("xl/sharedStrings.xml", "shared_strings")]
    [InlineData("xl/tables/table1.xml", "table")]
    [InlineData("xl/charts/chart1.xml", "chart")]
    [InlineData("xl/drawings/drawing1.xml", "drawing")]
    [InlineData("xl/externalLinks/externalLink1.xml", "external_link")]
    [InlineData("xl/embeddings/object1.bin", "embedded_object")]
    [InlineData("xl/vbaProject.bin", "macros")]
    [InlineData("_xmlsignatures/sig1.xml", "signatures")]
    [InlineData("xl/custom/unknown.xml", "unknown")]
    public void ChangedExcelPackageFeaturesAreClassifiedAndBlocked(
        string part,
        string category)
    {
        var content = part.EndsWith(".xml", StringComparison.Ordinal)
            ? "<root />"u8.ToArray()
            : [0x01, 0x02, 0x03];
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetWithFeature(part, content, "2", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        var result = MergeSpreadsheet(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.Analysis.Items, item => item.Category == category);
        Assert.Contains(result.Analysis.Blockers, blocker => blocker.Category == category);
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void EligiblePowerPointChangesRemainManualWhenKillSwitchIsOff()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["Base A"], ["Base B"]);
        using var ours = SyntheticOfficePackage.PresentationSlides(["Ours A"], ["Base B"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["Base A"], ["Theirs B"]);
        var result = MergePresentation(basis, ours, theirs, false);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("powerpoint_automatic_merge_disabled", result.FailureCode);
        Assert.True(result.Analysis.AutomaticMergeEligible);
        Assert.False(result.Analysis.AutomaticMergeEnabled);
        Assert.Empty(result.Analysis.Blockers);
        Assert.All(
            result.Analysis.Items,
            item => Assert.False(item.AutomaticallyResolved));
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void DisjointPowerPointSlidesProduceValidatedCandidate()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["Base A"], ["Base B"]);
        using var ours = SyntheticOfficePackage.PresentationSlides(["Ours A"], ["Base B"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["Base A"], ["Theirs B"]);
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("completed", result.Outcome);
        Assert.Equal("disjoint_powerpoint_slides", result.Strategy);
        Assert.True(result.Analysis.AutomaticMergeEnabled);
        Assert.True(result.Analysis.AutomaticMergeEligible);
        Assert.Equal(2, result.Analysis.Summary["non_overlapping"]);
        Assert.All(
            result.Analysis.Items,
            item => Assert.True(item.AutomaticallyResolved));
        Assert.Equal(["Ours A", "Theirs B"], PresentationText(result.CandidateBytes!));
    }

    [Fact]
    public void SameSlideDisjointShapeTextProducesValidatedCandidate()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["Base A", "Base B"]);
        using var ours = SyntheticOfficePackage.PresentationSlides(["Ours A", "Base B"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["Base A", "Theirs B"]);
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("completed", result.Outcome);
        Assert.Equal("disjoint_powerpoint_shapes", result.Strategy);
        Assert.Equal(["Ours A", "Theirs B"], PresentationText(result.CandidateBytes!));
    }

    [Fact]
    public void SamePowerPointShapeTextConflictIsExplained()
    {
        using var basis = SyntheticOfficePackage.Presentation("Base");
        using var ours = SyntheticOfficePackage.Presentation("Ours");
        using var theirs = SyntheticOfficePackage.Presentation("Theirs");
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Equal("powerpoint_changes_conflict", result.FailureCode);
        Assert.Equal(1, result.Analysis.Summary["true_conflict"]);
        Assert.Contains(
            result.Analysis.Blockers,
            blocker => blocker.Code == "incompatible_target_changes");
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void DeletedVersusEditedPowerPointSlideIsManual()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["First"], ["Second"]);
        using var ours = SyntheticOfficePackage.PresentationSlides(["First"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["First"], ["Second edited"]);
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.FailureCode, new[]
        {
            "powerpoint_change_unsupported",
            "powerpoint_package_change_unsupported",
            "powerpoint_changes_conflict",
        });
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void ReorderedVersusEditedPowerPointSlidesAreManual()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["First"], ["Second"]);
        using var ours = SyntheticOfficePackage.PresentationSlidesReordered(
            [1, 0],
            ["First"],
            ["Second"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["First edited"], ["Second"]);
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.Analysis.Items, item => item.Category == "slide");
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void GroupedPowerPointShapeChangesAreManual()
    {
        using var basis = SyntheticOfficePackage.PresentationWithGroup("Base");
        using var ours = SyntheticOfficePackage.PresentationWithGroup("Ours");
        using var theirs = SyntheticOfficePackage.PresentationWithGroup("Theirs");
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.FailureCode, new[]
        {
            "powerpoint_changes_conflict",
            "powerpoint_shape_match_ambiguous",
        });
    }

    [Theory]
    [InlineData("ppt/media/image1.png", "media")]
    [InlineData("ppt/charts/chart1.xml", "chart")]
    [InlineData("ppt/slideMasters/slideMaster1.xml", "master")]
    [InlineData("ppt/slideLayouts/slideLayout1.xml", "layout")]
    [InlineData("ppt/theme/theme1.xml", "theme")]
    [InlineData("ppt/notesSlides/notesSlide1.xml", "notes")]
    [InlineData("ppt/embeddings/object1.bin", "embedded_object")]
    [InlineData("ppt/vbaProject.bin", "macros")]
    [InlineData("_xmlsignatures/sig1.xml", "signatures")]
    [InlineData("ppt/custom/unknown.xml", "unknown")]
    public void ChangedPowerPointPackageFeaturesAreClassifiedAndBlocked(
        string part,
        string category)
    {
        var content = part.EndsWith(".xml", StringComparison.Ordinal)
            ? "<root />"u8.ToArray()
            : [0x01, 0x02, 0x03];
        using var basis = SyntheticOfficePackage.Presentation("Base");
        using var ours = SyntheticOfficePackage.PresentationWithFeature(part, content, ["Ours"]);
        using var theirs = SyntheticOfficePackage.Presentation("Theirs");
        var result = MergePresentation(basis, ours, theirs, true);

        Assert.Equal("manual_resolution_required", result.Outcome);
        Assert.Contains(result.Analysis.Items, item => item.Category == category);
        Assert.Contains(result.Analysis.Blockers, blocker => blocker.Category == category);
        Assert.Null(result.CandidateBytes);
    }

    [Fact]
    public void PowerPointCandidatePreservesEveryUntouchedPartByteForByte()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["Base A", "Base B"]);
        using var ours = SyntheticOfficePackage.PresentationSlides(["Ours A", "Base B"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["Base A", "Theirs B"]);
        var result = MergePresentation(basis, ours, theirs, true);
        var oursParts = PackageHashes(ours.Bytes);
        var candidateParts = PackageHashes(result.CandidateBytes!);
        var mutablePart = result.AppliedPaths.Single()
            .Split("/shapes/", StringSplitOptions.None)[0]
            .Replace("/presentation/slides/", string.Empty, StringComparison.Ordinal);

        Assert.Equal(oursParts.Keys.Order(), candidateParts.Keys.Order());
        foreach (var part in oursParts.Keys.Where(part => part != mutablePart))
        {
            Assert.True(
                oursParts[part] == candidateParts[part],
                $"Untouched part changed: {part}");
        }
    }

    [Fact]
    public void CorruptPowerPointCandidateFailsInspection()
    {
        using var package = SyntheticOfficePackage.Presentation("Valid");
        var bytes = package.Bytes;
        Array.Resize(ref bytes, bytes.Length / 2);
        var path = Path.Combine(Path.GetTempPath(), $"corrupt-candidate-{Guid.NewGuid():N}.pptx");
        try
        {
            File.WriteAllBytes(path, bytes);
            var result = new OoxmlInspector(new InspectionOptions()).Inspect(
                path,
                "presentation",
                Sha256(bytes));
            Assert.NotEqual("completed", result.Outcome);
        }
        finally
        {
            File.Delete(path);
        }
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
        Assert.Equal("1.2.0", json.RootElement.GetProperty("merge_schema_version").GetString());
        Assert.Equal(
            "1.0.0",
            json.RootElement.GetProperty("analysis").GetProperty("schema_version").GetString());
        Assert.True(json.RootElement.GetProperty("candidate_bytes").GetString()!.Length > 0);
    }

    [Fact]
    public async Task InternalEndpointHonorsPowerPointPilotGate()
    {
        using var basis = SyntheticOfficePackage.PresentationSlides(["Base A"], ["Base B"]);
        using var ours = SyntheticOfficePackage.PresentationSlides(["Ours A"], ["Base B"]);
        using var theirs = SyntheticOfficePackage.PresentationSlides(["Base A"], ["Theirs B"]);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/merges")
        {
            Content = new ByteArrayContent(
                basis.Bytes.Concat(ours.Bytes).Concat(theirs.Bytes).ToArray()),
        };
        request.Headers.Add("X-MergeCom-Internal-Token", Token);
        request.Headers.Add("X-MergeCom-Trace-Id", Guid.NewGuid().ToString());
        request.Headers.Add("X-MergeCom-File-Type", "presentation");
        request.Headers.Add("X-MergeCom-Extension", ".pptx");
        request.Headers.Add("X-MergeCom-Base-Sha256", Sha256(basis.Bytes));
        request.Headers.Add("X-MergeCom-Ours-Sha256", Sha256(ours.Bytes));
        request.Headers.Add("X-MergeCom-Theirs-Sha256", Sha256(theirs.Bytes));
        request.Headers.Add("X-MergeCom-Base-Size", basis.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Ours-Size", ours.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Theirs-Size", theirs.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-PowerPoint-Automatic-Merge", "true");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("completed", json.RootElement.GetProperty("outcome").GetString());
        Assert.Equal(
            "disjoint_powerpoint_slides",
            json.RootElement.GetProperty("strategy").GetString());
        Assert.True(
            json.RootElement.GetProperty("analysis").GetProperty("automatic_merge_enabled").GetBoolean());
        Assert.True(
            json.RootElement.GetProperty("analysis").GetProperty("automatic_merge_eligible").GetBoolean());
    }

    [Fact]
    public async Task InternalEndpointHonorsExcelPilotGate()
    {
        using var basis = SyntheticOfficePackage.SpreadsheetCells("1", "10");
        using var ours = SyntheticOfficePackage.SpreadsheetCells("2", "10");
        using var theirs = SyntheticOfficePackage.SpreadsheetCells("1", "20");
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/internal/v1/merges")
        {
            Content = new ByteArrayContent(
                basis.Bytes.Concat(ours.Bytes).Concat(theirs.Bytes).ToArray()),
        };
        request.Headers.Add("X-MergeCom-Internal-Token", Token);
        request.Headers.Add("X-MergeCom-Trace-Id", Guid.NewGuid().ToString());
        request.Headers.Add("X-MergeCom-File-Type", "spreadsheet");
        request.Headers.Add("X-MergeCom-Extension", ".xlsx");
        request.Headers.Add("X-MergeCom-Base-Sha256", Sha256(basis.Bytes));
        request.Headers.Add("X-MergeCom-Ours-Sha256", Sha256(ours.Bytes));
        request.Headers.Add("X-MergeCom-Theirs-Sha256", Sha256(theirs.Bytes));
        request.Headers.Add("X-MergeCom-Base-Size", basis.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Ours-Size", ours.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Theirs-Size", theirs.Bytes.Length.ToString());
        request.Headers.Add("X-MergeCom-Excel-Automatic-Merge", "true");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("completed", json.RootElement.GetProperty("outcome").GetString());
        Assert.Equal(
            "disjoint_excel_cells",
            json.RootElement.GetProperty("strategy").GetString());
        Assert.True(
            json.RootElement.GetProperty("analysis").GetProperty("automatic_merge_enabled").GetBoolean());
        Assert.True(
            json.RootElement.GetProperty("analysis").GetProperty("automatic_merge_eligible").GetBoolean());
    }

    private static OoxmlMerger Merger()
    {
        var options = new InspectionOptions();
        return new(options, new OoxmlComparator());
    }

    private static MergeResult MergePresentation(
        SyntheticOfficePackage basis,
        SyntheticOfficePackage ours,
        SyntheticOfficePackage theirs,
        bool automaticMergeEnabled)
    {
        var candidatePath = Path.Combine(Path.GetTempPath(), $"candidate-{Guid.NewGuid():N}.pptx");
        try
        {
            return Merger().Merge(
                basis.Path,
                ours.Path,
                theirs.Path,
                "presentation",
                Sha256(basis.Bytes),
                Sha256(ours.Bytes),
                Sha256(theirs.Bytes),
                candidatePath,
                automaticMergeEnabled);
        }
        finally
        {
            File.Delete(candidatePath);
        }
    }

    private static MergeResult MergeSpreadsheet(
        SyntheticOfficePackage basis,
        SyntheticOfficePackage ours,
        SyntheticOfficePackage theirs,
        bool automaticMergeEnabled)
    {
        var candidatePath = Path.Combine(Path.GetTempPath(), $"candidate-{Guid.NewGuid():N}.xlsx");
        try
        {
            return Merger().Merge(
                basis.Path,
                ours.Path,
                theirs.Path,
                "spreadsheet",
                Sha256(basis.Bytes),
                Sha256(ours.Bytes),
                Sha256(theirs.Bytes),
                candidatePath,
                false,
                automaticMergeEnabled);
        }
        finally
        {
            File.Delete(candidatePath);
        }
    }

    private static string[] PresentationText(byte[] bytes)
    {
        using var document = PresentationDocument.Open(new MemoryStream(bytes), false);
        var presentationPart = document.PresentationPart
            ?? throw new InvalidDataException("Presentation part missing.");
        var presentation = presentationPart.Presentation
            ?? throw new InvalidDataException("Presentation XML missing.");
        return presentation.SlideIdList!.Elements<P.SlideId>()
            .SelectMany(slideId =>
            {
                var relationshipId = slideId.RelationshipId?.Value
                    ?? throw new InvalidDataException("Slide relationship missing.");
                var slidePart = (SlidePart)presentationPart.GetPartById(relationshipId);
                return (slidePart.Slide
                    ?? throw new InvalidDataException("Slide XML missing."))
                    .Descendants<DocumentFormat.OpenXml.Drawing.Text>();
            })
            .Select(text => text.Text)
            .ToArray();
    }

    private static string[] SpreadsheetValues(byte[] bytes)
    {
        using var document = SpreadsheetDocument.Open(new MemoryStream(bytes), false);
        return document.WorkbookPart!.WorksheetParts
            .SelectMany(part => part.Worksheet!.Descendants<S.Cell>())
            .Select(cell => cell.CellValue?.Text ?? cell.InlineString?.InnerText ?? string.Empty)
            .ToArray();
    }

    private static IReadOnlyDictionary<string, string> PackageHashes(byte[] bytes)
    {
        using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        return archive.Entries.ToDictionary(
            entry => entry.FullName,
            entry =>
            {
                using var stream = entry.Open();
                return Convert.ToHexStringLower(SHA256.HashData(stream));
            },
            StringComparer.Ordinal);
    }

    private static string Sha256(byte[] bytes)
        => Convert.ToHexStringLower(SHA256.HashData(bytes));
}

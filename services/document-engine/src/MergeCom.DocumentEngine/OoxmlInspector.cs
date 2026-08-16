using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using P = DocumentFormat.OpenXml.Presentation;
using S = DocumentFormat.OpenXml.Spreadsheet;
using W = DocumentFormat.OpenXml.Wordprocessing;

namespace MergeCom.DocumentEngine;

public sealed class OoxmlInspector(InspectionOptions options)
{
    public const string ParserVersion = "1.0.0";
    public const string SchemaVersion = "1.0.0";

    private static readonly JsonSerializerOptions StableJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public InspectionResult Inspect(string packagePath, string fileType, string sourceSha256)
    {
        var facts = new PackageFacts();
        var warnings = new List<InspectionWarning>();
        var validationErrors = new List<ValidationIssue>();
        object payload = new Dictionary<string, object>();
        var outcome = "completed";
        string? failureCode = null;

        try
        {
            facts = new PackagePreflight(options).Inspect(packagePath);
            warnings.AddRange(facts.Warnings);
            (payload, validationErrors) = InspectWithSdk(packagePath, fileType);
            if (validationErrors.Count > 0)
            {
                warnings.Add(new(
                    "ooxml_validation_errors",
                    $"Open XML validation reported {validationErrors.Count} error(s).",
                    null));
            }
        }
        catch (InspectionRejectedException exception)
        {
            outcome = exception.Outcome;
            failureCode = exception.Code;
            warnings.Add(new(exception.Code, exception.Message, exception.Part));
        }
        catch (OpenXmlPackageException exception)
        {
            outcome = "permanently_failed";
            failureCode = "ooxml_package_invalid";
            warnings.Add(new("ooxml_package_invalid", "The package cannot be opened as the declared Office document type.", null));
            _ = exception;
        }
        catch (InvalidDataException exception)
        {
            outcome = "permanently_failed";
            failureCode = "package_corrupt";
            warnings.Add(new("package_corrupt", "The Office package is corrupt.", null));
            _ = exception;
        }

        var orderedWarnings = warnings
            .DistinctBy(item => (item.Code, item.Message, item.Part, item.Severity))
            .OrderBy(item => item.Code, StringComparer.Ordinal)
            .ThenBy(item => item.Part, StringComparer.Ordinal)
            .ToArray();
        var orderedUnsupported = facts.UnsupportedFeatures.Order(StringComparer.Ordinal).ToArray();
        var orderedValidation = validationErrors
            .OrderBy(item => item.Code, StringComparer.Ordinal)
            .ThenBy(item => item.Part, StringComparer.Ordinal)
            .ThenBy(item => item.Path, StringComparer.Ordinal)
            .Take(options.MaxValidationErrors)
            .ToArray();
        var basis = new StableSnapshotBasis(
            SchemaVersion,
            ParserVersion,
            fileType,
            sourceSha256,
            facts.Summary(),
            orderedWarnings,
            orderedUnsupported,
            orderedValidation,
            payload);
        var stableHash = Convert.ToHexStringLower(
            SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(basis, StableJsonOptions)));
        var snapshot = new SnapshotEnvelope(
            SchemaVersion,
            ParserVersion,
            fileType,
            sourceSha256,
            facts.Summary(),
            orderedWarnings,
            orderedUnsupported,
            orderedValidation,
            stableHash,
            payload);
        return new InspectionResult(outcome, failureCode, snapshot);
    }

    private (object Payload, List<ValidationIssue> ValidationErrors) InspectWithSdk(
        string packagePath,
        string fileType)
    {
        var settings = new OpenSettings
        {
            AutoSave = false,
            MaxCharactersInPart = options.MaxXmlCharacters,
        };

        return fileType switch
        {
            "presentation" => InspectPresentation(packagePath, settings),
            "spreadsheet" => InspectSpreadsheet(packagePath, settings),
            "word_document" => InspectWord(packagePath, settings),
            _ => throw new InspectionRejectedException(
                "file_type_unsupported",
                "The requested Office document type is unsupported.",
                "permanently_failed"),
        };
    }

    private (object, List<ValidationIssue>) InspectPresentation(string path, OpenSettings settings)
    {
        using var document = PresentationDocument.Open(path, false, settings);
        var presentationPart = document.PresentationPart
            ?? throw InvalidStructure("presentation_main_part_missing", "The presentation main part is missing.");
        var presentation = presentationPart.Presentation
            ?? throw InvalidStructure("presentation_xml_missing", "The presentation XML root is missing.");
        var slideIds = presentation.SlideIdList?.Elements<P.SlideId>().ToArray()
            ?? [];
        var slides = new List<PresentationSlide>(slideIds.Length);
        for (var index = 0; index < slideIds.Length; index++)
        {
            var relationshipId = slideIds[index].RelationshipId?.Value;
            if (string.IsNullOrWhiteSpace(relationshipId))
            {
                throw InvalidStructure("presentation_slide_relationship_missing", "A slide has no relationship identifier.");
            }

            if (presentationPart.GetPartById(relationshipId) is not SlidePart slidePart)
            {
                throw InvalidStructure("presentation_slide_part_missing", "A slide relationship does not resolve to a slide part.");
            }

            var slide = slidePart.Slide
                ?? throw InvalidStructure("presentation_slide_xml_missing", "A slide XML root is missing.");
            var shapeTree = slide.CommonSlideData?.ShapeTree;
            var shapeCount = shapeTree?.ChildElements.Count(IsPresentationShape) ?? 0;
            slides.Add(new(
                index + 1,
                relationshipId,
                slidePart.Uri.ToString(),
                slidePart.SlideLayoutPart?.Uri.ToString(),
                slidePart.SlideLayoutPart?.SlideMasterPart?.Uri.ToString(),
                shapeCount,
                slidePart.Parts.Count() + slidePart.ExternalRelationships.Count(),
                slidePart.NotesSlidePart is not null));
        }

        return (new PresentationInventory(slides), Validate(document));
    }

    private (object, List<ValidationIssue>) InspectSpreadsheet(string path, OpenSettings settings)
    {
        using var document = SpreadsheetDocument.Open(path, false, settings);
        var workbookPart = document.WorkbookPart
            ?? throw InvalidStructure("workbook_main_part_missing", "The workbook main part is missing.");
        var workbook = workbookPart.Workbook
            ?? throw InvalidStructure("workbook_xml_missing", "The workbook XML root is missing.");
        var sheetElements = workbook.Sheets?.Elements<S.Sheet>().ToArray() ?? [];
        var sheets = new List<SpreadsheetSheet>(sheetElements.Length);
        var tableCount = 0;
        var chartCount = 0;
        for (var index = 0; index < sheetElements.Length; index++)
        {
            var sheet = sheetElements[index];
            var relationshipId = sheet.Id?.Value;
            if (string.IsNullOrWhiteSpace(relationshipId)
                || workbookPart.GetPartById(relationshipId) is not WorksheetPart worksheetPart)
            {
                throw InvalidStructure("worksheet_relationship_invalid", "A sheet relationship does not resolve to a worksheet part.");
            }

            var sheetTables = worksheetPart.TableDefinitionParts.Count();
            var sheetCharts = worksheetPart.DrawingsPart?.ChartParts.Count() ?? 0;
            tableCount += sheetTables;
            chartCount += sheetCharts;
            var worksheet = worksheetPart.Worksheet
                ?? throw InvalidStructure("worksheet_xml_missing", "A worksheet XML root is missing.");
            sheets.Add(new(
                index + 1,
                sheet.Name?.Value ?? string.Empty,
                relationshipId,
                sheet.State?.Value.ToString().ToLowerInvariant() ?? "visible",
                worksheet.SheetDimension?.Reference?.Value,
                sheetTables,
                sheetCharts));
        }

        var names = workbook.DefinedNames?
            .Elements<S.DefinedName>()
            .Select(item => item.Name?.Value ?? string.Empty)
            .Where(name => name.Length > 0)
            .Order(StringComparer.Ordinal)
            .ToArray() ?? [];
        return (new SpreadsheetInventory(sheets, names, tableCount, chartCount), Validate(document));
    }

    private (object, List<ValidationIssue>) InspectWord(string path, OpenSettings settings)
    {
        using var document = WordprocessingDocument.Open(path, false, settings);
        var mainPart = document.MainDocumentPart
            ?? throw InvalidStructure("word_main_part_missing", "The Word document main part is missing.");
        var wordDocument = mainPart.Document
            ?? throw InvalidStructure("word_document_xml_missing", "The Word document XML root is missing.");
        var body = wordDocument.Body
            ?? throw InvalidStructure("word_body_missing", "The Word document body is missing.");
        var paragraphs = body.Descendants<W.Paragraph>().ToArray();
        var headings = paragraphs.Count(paragraph =>
            paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value
                ?.StartsWith("Heading", StringComparison.OrdinalIgnoreCase) == true);
        var trackedChanges = wordDocument.Descendants()
            .Count(element => element.LocalName is "ins" or "del" or "moveFrom" or "moveTo");
        var inventory = new WordInventory(
            body.Descendants<W.SectionProperties>().Count(),
            paragraphs.Length,
            headings,
            body.Descendants<W.Table>().Count(),
            mainPart.HeaderParts.Count(),
            mainPart.FooterParts.Count(),
            mainPart.FootnotesPart?.Footnotes?.Elements<W.Footnote>().Count() ?? 0,
            mainPart.EndnotesPart?.Endnotes?.Elements<W.Endnote>().Count() ?? 0,
            mainPart.WordprocessingCommentsPart?.Comments?.Elements<W.Comment>().Count() ?? 0,
            trackedChanges);
        return (inventory, Validate(document));
    }

    private List<ValidationIssue> Validate(OpenXmlPackage package)
    {
        var validator = new OpenXmlValidator();
        return validator.Validate(package)
            .Take(options.MaxValidationErrors)
            .Select(error => new ValidationIssue(
                error.Id ?? "openxml_validation",
                error.Description ?? "Open XML validation error.",
                error.Part?.Uri.ToString(),
                error.Path?.XPath))
            .ToList();
    }

    private static bool IsPresentationShape(OpenXmlElement element) => element is P.Shape
        or P.GraphicFrame
        or P.Picture
        or P.GroupShape
        or P.ConnectionShape;

    private static InspectionRejectedException InvalidStructure(string code, string message)
        => new(code, message, "permanently_failed");

    private sealed record StableSnapshotBasis(
        string SchemaVersion,
        string ParserVersion,
        string FileType,
        string SourceSha256,
        PackageSummary Package,
        IReadOnlyList<InspectionWarning> Warnings,
        IReadOnlyList<string> UnsupportedFeatures,
        IReadOnlyList<ValidationIssue> ValidationErrors,
        object FormatPayload);
}

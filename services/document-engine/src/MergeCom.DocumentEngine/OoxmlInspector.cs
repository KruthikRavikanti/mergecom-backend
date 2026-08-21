using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using D = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;
using S = DocumentFormat.OpenXml.Spreadsheet;
using W = DocumentFormat.OpenXml.Wordprocessing;

namespace MergeCom.DocumentEngine;

public sealed class OoxmlInspector(InspectionOptions options)
{
    public const string ParserVersion = "1.2.0";
    public const string SchemaVersion = "1.2.0";

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
        var semanticBudget = new SemanticBudget(
            options.MaxSemanticItems,
            options.MaxSemanticTextCharacters);

        try
        {
            facts = new PackagePreflight(options).Inspect(packagePath);
            warnings.AddRange(facts.Warnings);
            (payload, validationErrors) = InspectWithSdk(packagePath, fileType, semanticBudget);
            AddCoverageFeatures(facts, payload);
            if (semanticBudget.Truncated)
            {
                facts.UnsupportedFeatures.Add("semantic_content_truncated");
                warnings.Add(new(
                    "semantic_content_truncated",
                    "Semantic content exceeded the normalized snapshot limits.",
                    null));
            }
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
        string fileType,
        SemanticBudget semanticBudget)
    {
        var settings = new OpenSettings
        {
            AutoSave = false,
            MaxCharactersInPart = options.MaxXmlCharacters,
        };

        return fileType switch
        {
            "presentation" => InspectPresentation(packagePath, settings, semanticBudget),
            "spreadsheet" => InspectSpreadsheet(packagePath, settings, semanticBudget),
            "word_document" => InspectWord(packagePath, settings, semanticBudget),
            _ => throw new InspectionRejectedException(
                "file_type_unsupported",
                "The requested Office document type is unsupported.",
                "permanently_failed"),
        };
    }

    private (object, List<ValidationIssue>) InspectPresentation(
        string path,
        OpenSettings settings,
        SemanticBudget semanticBudget)
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
            var shapes = new List<PresentationShape>(shapeCount);
            if (shapeTree is not null)
            {
                var shapeIndex = 0;
                var assetHashes = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var shape in shapeTree.ChildElements.Where(IsPresentationShape))
                {
                    shapeIndex++;
                    var properties = shape.Descendants<P.NonVisualDrawingProperties>().FirstOrDefault();
                    var id = properties?.Id?.Value.ToString() ?? $"position-{shapeIndex}";
                    var values = new[]
                    {
                        properties?.Name?.Value ?? string.Empty,
                        shape.InnerText,
                    };
                    if (!semanticBudget.TryCapture(values, out var captured))
                    {
                        continue;
                    }

                    shapes.Add(new(
                        id,
                        shapeIndex,
                        captured[0] ?? string.Empty,
                        shape.LocalName,
                        captured[1] ?? string.Empty,
                        HashText(shape.OuterXml),
                        PresentationAssetHash(slidePart, shape, assetHashes),
                        PresentationBoundsFor(shape)));
                }
            }

            slides.Add(new(
                index + 1,
                relationshipId,
                slidePart.Uri.ToString(),
                slidePart.SlideLayoutPart?.Uri.ToString(),
                slidePart.SlideLayoutPart?.SlideMasterPart?.Uri.ToString(),
                shapeCount,
                slidePart.Parts.Count() + slidePart.ExternalRelationships.Count(),
                slidePart.NotesSlidePart is not null,
                shapes));
        }

        return (new PresentationInventory(
            presentation.SlideSize?.Cx?.Value ?? 0,
            presentation.SlideSize?.Cy?.Value ?? 0,
            slides), Validate(document));
    }

    private (object, List<ValidationIssue>) InspectSpreadsheet(
        string path,
        OpenSettings settings,
        SemanticBudget semanticBudget)
    {
        using var document = SpreadsheetDocument.Open(path, false, settings);
        var workbookPart = document.WorkbookPart
            ?? throw InvalidStructure("workbook_main_part_missing", "The workbook main part is missing.");
        var workbook = workbookPart.Workbook
            ?? throw InvalidStructure("workbook_xml_missing", "The workbook XML root is missing.");
        var sheetElements = workbook.Sheets?.Elements<S.Sheet>().ToArray() ?? [];
        var sheets = new List<SpreadsheetSheet>(sheetElements.Length);
        var sharedStrings = workbookPart.SharedStringTablePart?.SharedStringTable?
            .Elements<S.SharedStringItem>()
            .Select(item => item.InnerText)
            .ToArray() ?? [];
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
            var cells = new List<SpreadsheetCell>();
            foreach (var cell in worksheet.Descendants<S.Cell>())
            {
                var reference = cell.CellReference?.Value;
                if (string.IsNullOrWhiteSpace(reference))
                {
                    continue;
                }

                var formula = cell.CellFormula?.Text;
                var value = CellValue(cell, sharedStrings);
                if (value.Length == 0 && string.IsNullOrEmpty(formula))
                {
                    continue;
                }

                if (!semanticBudget.TryCapture([value, formula], out var captured))
                {
                    continue;
                }

                cells.Add(new(
                    reference,
                    captured[0] ?? string.Empty,
                    captured[1],
                    cell.DataType?.Value.ToString().ToLowerInvariant() ?? "number",
                    cell.StyleIndex?.Value));
            }

            var mergedRanges = worksheet.Descendants<S.MergeCell>()
                .Select(item => item.Reference?.Value)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Select(item => item!)
                .Order(StringComparer.Ordinal)
                .ToArray();
            var hiddenRows = worksheet.Descendants<S.Row>()
                .Where(row => row.Hidden?.Value == true && row.RowIndex?.Value is not null)
                .Select(row => row.RowIndex!.Value)
                .Order()
                .ToArray();
            var hiddenColumns = worksheet.Descendants<S.Column>()
                .Where(column => column.Hidden?.Value == true)
                .Select(column => $"{column.Min?.Value ?? 0}:{column.Max?.Value ?? 0}")
                .Order(StringComparer.Ordinal)
                .ToArray();

            sheets.Add(new(
                index + 1,
                sheet.SheetId?.Value,
                sheet.Name?.Value ?? string.Empty,
                relationshipId,
                sheet.State?.Value.ToString().ToLowerInvariant() ?? "visible",
                worksheet.SheetDimension?.Reference?.Value,
                sheetTables,
                sheetCharts,
                worksheetPart.DrawingsPart is not null,
                mergedRanges,
                hiddenRows,
                hiddenColumns,
                cells));
        }

        var names = new List<SpreadsheetDefinedName>();
        foreach (var item in workbook.DefinedNames?.Elements<S.DefinedName>() ?? [])
        {
            var name = item.Name?.Value;
            if (string.IsNullOrWhiteSpace(name)
                || !semanticBudget.TryCapture([name, item.Text ?? string.Empty], out var captured))
            {
                continue;
            }

            names.Add(new(
                captured[0]!,
                captured[1] ?? string.Empty,
                item.LocalSheetId?.Value));
        }

        names.Sort((left, right) =>
        {
            var byName = StringComparer.Ordinal.Compare(left.Name, right.Name);
            return byName != 0
                ? byName
                : Nullable.Compare(left.LocalSheetId, right.LocalSheetId);
        });
        return (new SpreadsheetInventory(sheets, names, tableCount, chartCount), Validate(document));
    }

    private (object, List<ValidationIssue>) InspectWord(
        string path,
        OpenSettings settings,
        SemanticBudget semanticBudget)
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
        var blocks = WordBlocks(body, semanticBudget);
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
            mainPart.ImageParts.Count(),
            trackedChanges,
            blocks);
        return (inventory, Validate(document));
    }

    private static string CellValue(S.Cell cell, IReadOnlyList<string> sharedStrings)
    {
        if (cell.DataType?.Value == S.CellValues.SharedString
            && int.TryParse(cell.CellValue?.Text, out var index)
            && index >= 0
            && index < sharedStrings.Count)
        {
            return sharedStrings[index];
        }

        return cell.DataType?.Value == S.CellValues.InlineString
            ? cell.InlineString?.InnerText ?? string.Empty
            : cell.CellValue?.Text ?? string.Empty;
    }

    private static IReadOnlyList<WordBlock> WordBlocks(W.Body body, SemanticBudget semanticBudget)
    {
        var blocks = new List<WordBlock>();
        foreach (var paragraph in body.Descendants<W.Paragraph>())
        {
            AddWordBlock(
                blocks,
                semanticBudget,
                WordBlockPath(body, paragraph),
                paragraph.Ancestors<W.TableCell>().Any() ? "table_cell" : "paragraph",
                paragraph);
        }

        return blocks;
    }

    private static string WordBlockPath(W.Body body, W.Paragraph paragraph)
    {
        var segments = new Stack<string>();
        OpenXmlElement current = paragraph;
        while (!ReferenceEquals(current, body))
        {
            var parent = current.Parent
                ?? throw InvalidStructure("word_block_path_invalid", "A Word body block has no parent.");
            var position = 0;
            foreach (var sibling in parent.ChildElements)
            {
                if (string.Equals(sibling.LocalName, current.LocalName, StringComparison.Ordinal))
                {
                    position++;
                }

                if (ReferenceEquals(sibling, current))
                {
                    break;
                }
            }

            segments.Push($"{current.LocalName}/{position}");
            current = parent;
        }

        return $"/body/{string.Join('/', segments)}";
    }

    private static void AddWordBlock(
        ICollection<WordBlock> blocks,
        SemanticBudget semanticBudget,
        string path,
        string kind,
        W.Paragraph paragraph)
    {
        var style = paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value;
        if (!semanticBudget.TryCapture([paragraph.InnerText, style], out var captured))
        {
            return;
        }

        blocks.Add(new(
            path,
            kind,
            captured[0] ?? string.Empty,
            captured[1],
            HashText(paragraph.OuterXml)));
    }

    private static string? PresentationAssetHash(
        SlidePart slidePart,
        OpenXmlElement shape,
        IDictionary<string, string> cache)
    {
        var relationshipId = shape.Descendants<D.Blip>()
            .Select(blip => blip.Embed?.Value)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        if (relationshipId is null)
        {
            return null;
        }

        if (cache.TryGetValue(relationshipId, out var cached))
        {
            return cached;
        }

        if (slidePart.GetPartById(relationshipId) is not OpenXmlPart assetPart)
        {
            return null;
        }

        using var stream = assetPart.GetStream(FileMode.Open, FileAccess.Read);
        var hash = Convert.ToHexStringLower(SHA256.HashData(stream));
        cache[relationshipId] = hash;
        return hash;
    }

    private static string HashText(string value)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static void AddCoverageFeatures(PackageFacts facts, object payload)
    {
        if (payload is PresentationInventory presentation
            && presentation.Slides.Any(slide => slide.HasNotes))
        {
            facts.UnsupportedFeatures.Add("presentation_notes_content");
        }

        if (payload is PresentationInventory presentationWithLinkedVisuals
            && presentationWithLinkedVisuals.Slides
                .SelectMany(slide => slide.Shapes)
                .Any(shape => shape.Kind == "graphicFrame"))
        {
            facts.UnsupportedFeatures.Add("presentation_linked_visual_content");
        }

        if (payload is SpreadsheetInventory spreadsheet
            && (spreadsheet.TableCount > 0
                || spreadsheet.ChartCount > 0
                || spreadsheet.Sheets.Any(sheet => sheet.HasDrawings)))
        {
            facts.UnsupportedFeatures.Add("spreadsheet_table_chart_content");
        }

        if (payload is WordInventory word)
        {
            if (word.HeaderCount > 0
                || word.FooterCount > 0
                || word.FootnoteCount > 0
                || word.EndnoteCount > 0
                || word.CommentCount > 0
                || word.ImageCount > 0)
            {
                facts.UnsupportedFeatures.Add("word_auxiliary_story_content");
            }

            if (word.TrackedChangeCount > 0)
            {
                facts.UnsupportedFeatures.Add("word_tracked_change_semantics");
            }
        }
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

    private static PresentationBounds? PresentationBoundsFor(OpenXmlElement shape)
    {
        var offset = shape.Descendants<DocumentFormat.OpenXml.Drawing.Offset>().FirstOrDefault();
        var extents = shape.Descendants<DocumentFormat.OpenXml.Drawing.Extents>().FirstOrDefault();
        var x = offset?.X?.Value;
        var y = offset?.Y?.Value;
        var width = extents?.Cx?.Value;
        var height = extents?.Cy?.Value;
        return x is not null && y is not null && width > 0 && height > 0
            ? new PresentationBounds(x.Value, y.Value, width.Value, height.Value)
            : null;
    }

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

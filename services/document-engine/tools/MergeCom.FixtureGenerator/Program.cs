using System.IO.Compression;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using D = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;
using S = DocumentFormat.OpenXml.Spreadsheet;
using W = DocumentFormat.OpenXml.Wordprocessing;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: fixture-generator <output-directory>");
    return 2;
}

var output = Path.GetFullPath(args[0]);
Directory.CreateDirectory(output);
CreateWord(Path.Combine(output, "visual-word.docx"), revised: false, sample: false);
CreateSpreadsheet(Path.Combine(output, "visual-excel.xlsx"), externalLink: false, revised: false, sample: false);
CreateSpreadsheet(Path.Combine(output, "external-link-excel.xlsx"), externalLink: true, revised: false, sample: false);
CreatePresentation(Path.Combine(output, "visual-powerpoint.pptx"), revised: false, sample: false);
CreateWord(Path.Combine(output, "sample-word-v1.docx"), revised: false, sample: true);
CreateWord(Path.Combine(output, "sample-word-v2.docx"), revised: true, sample: true);
CreateSpreadsheet(Path.Combine(output, "sample-excel-v1.xlsx"), externalLink: false, revised: false, sample: true);
CreateSpreadsheet(Path.Combine(output, "sample-excel-v2.xlsx"), externalLink: false, revised: true, sample: true);
CreatePresentation(Path.Combine(output, "sample-powerpoint-v1.pptx"), revised: false, sample: true);
CreatePresentation(Path.Combine(output, "sample-powerpoint-v2.pptx"), revised: true, sample: true);
CreateMacroFixture(Path.Combine(output, "macro-word.docm"));
File.WriteAllText(Path.Combine(output, "corrupt-office.docx"), "This is intentionally not an OOXML ZIP package.");
Console.WriteLine($"Generated sanitized Office fixtures in {output}");
return 0;

static void CreateWord(string path, bool revised, bool sample)
{
    using var document = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
    var main = document.AddMainDocumentPart();
    var table = new W.Table(
        new W.TableProperties(new W.TableBorders(
            new W.TopBorder { Val = W.BorderValues.Single },
            new W.BottomBorder { Val = W.BorderValues.Single },
            new W.LeftBorder { Val = W.BorderValues.Single },
            new W.RightBorder { Val = W.BorderValues.Single },
            new W.InsideHorizontalBorder { Val = W.BorderValues.Single },
            new W.InsideVerticalBorder { Val = W.BorderValues.Single })),
        new W.TableGrid(new W.GridColumn(), new W.GridColumn()),
        Row("Metric", "Value"),
        Row("Pipeline", revised ? "48" : "42"));
    if (revised)
    {
        table.Append(Row("Renewals", "11"));
    }
    main.Document = new W.Document(
        new W.Body(
            new W.Paragraph(
                new W.ParagraphProperties(new W.ParagraphStyleId { Val = revised ? "Heading2" : "Heading1" }),
                new W.Run(new W.Text(sample ? "[SAMPLE] Quarterly plan" : "Quarterly plan"))),
            new W.Paragraph(new W.Run(new W.Text(revised
                ? "Revenue grew from 120 to 152 synthetic units."
                : sample
                    ? "Revenue grew from 120 to 145 synthetic units."
                    : "Revenue grew from 120 to 145 units."))),
            new W.Paragraph(new W.Run(new W.Text("All names and values in this fixture are synthetic."))),
            table,
            new W.SectionProperties(
                new W.PageSize { Width = 12_240, Height = 15_840 },
                new W.PageMargin { Top = 1_440, Right = 1_440, Bottom = 1_440, Left = 1_440 })));
    main.Document.Save();
}

static W.TableRow Row(string left, string right)
    => new(
        new W.TableCell(new W.Paragraph(new W.Run(new W.Text(left)))),
        new W.TableCell(new W.Paragraph(new W.Run(new W.Text(right)))));

static void CreateSpreadsheet(string path, bool externalLink, bool revised, bool sample)
{
    using var document = SpreadsheetDocument.Create(path, SpreadsheetDocumentType.Workbook);
    var workbook = document.AddWorkbookPart();
    workbook.Workbook = new S.Workbook();
    var sheets = workbook.Workbook.AppendChild(new S.Sheets());
    var inputs = workbook.AddNewPart<WorksheetPart>("rId1");
    var inputData = new S.SheetData(
        SheetRow(1, TextCell("A1", sample ? "[SAMPLE] Metric" : "Metric"), TextCell("B1", "Jan"), TextCell("C1", "Feb"), TextCell("D1", "Total")),
        SheetRow(2, TextCell("A2", "Revenue"), NumberCell("B2", "120"), NumberCell("C2", revised ? "152" : "145"), FormulaCell("D2", revised ? "ROUND(SUM(B2:C2),0)" : "SUM(B2:C2)", revised ? "272" : "265")),
        new S.Row(NumberCell("A3", "3")) { RowIndex = 3, Hidden = true },
        SheetRow(4, TextCell("A4", "Pipeline"), NumberCell("B4", "18"), NumberCell("C4", revised ? "30" : "24"), FormulaCell("D4", "SUM(B4:C4)", revised ? "48" : "42")));
    if (revised)
    {
        inputData.Append(SheetRow(5, TextCell("A5", "Renewals"), NumberCell("B5", "5"), NumberCell("C5", "6"), FormulaCell("D5", "SUM(B5:C5)", "11")));
    }
    inputs.Worksheet = new S.Worksheet(
        new S.SheetDimension { Reference = "A1:D8" },
        new S.Columns(
            new S.Column { Min = 2, Max = 2, Hidden = true, Width = 12, CustomWidth = true }),
        inputData,
        new S.MergeCells(new S.MergeCell { Reference = "A6:D6" }));
    if (externalLink)
    {
        inputs.AddExternalRelationship(
            "https://example.invalid/synthetic-source.xlsx",
            new Uri("https://example.invalid/synthetic-source.xlsx"),
            "rIdExternal");
    }
    sheets.Append(new S.Sheet { Id = "rId1", Name = "Inputs", SheetId = 1 });

    var summary = workbook.AddNewPart<WorksheetPart>("rId2");
    summary.Worksheet = new S.Worksheet(
        new S.SheetDimension { Reference = "A1:B2" },
        new S.SheetData(
            SheetRow(1, TextCell("A1", sample ? "[SAMPLE] Summary" : "Summary"), TextCell("B1", "Stored values")),
            SheetRow(2, TextCell("A2", "Total"), NumberCell("B2", revised ? "331" : "307"))));
    sheets.Append(new S.Sheet { Id = "rId2", Name = "Summary", SheetId = 2 });
    workbook.Workbook.Save();
}

static S.Row SheetRow(uint index, params S.Cell[] cells) => new(cells) { RowIndex = index };

static S.Cell TextCell(string reference, string value)
    => new() { CellReference = reference, DataType = S.CellValues.InlineString, InlineString = new S.InlineString(new S.Text(value)) };

static S.Cell NumberCell(string reference, string value)
    => new() { CellReference = reference, CellValue = new S.CellValue(value) };

static S.Cell FormulaCell(string reference, string formula, string value)
    => new() { CellReference = reference, CellFormula = new S.CellFormula(formula), CellValue = new S.CellValue(value) };

static void CreatePresentation(string path, bool revised, bool sample)
{
    using var document = PresentationDocument.Create(path, PresentationDocumentType.Presentation);
    var presentation = document.AddPresentationPart();
    presentation.Presentation = new P.Presentation(
        new P.SlideMasterIdList(),
        new P.SlideIdList(),
        new P.SlideSize { Cx = 12_192_000, Cy = 6_858_000, Type = P.SlideSizeValues.Screen16x9 },
        new P.NotesSize { Cx = 6_858_000, Cy = 9_144_000 });
    var ids = presentation.Presentation.SlideIdList!;
    var slideCount = revised ? 4 : 3;
    for (var index = 0; index < slideCount; index++)
    {
        var slide = presentation.AddNewPart<SlidePart>($"rId{index + 1}");
        var tree = new P.ShapeTree(
            new P.NonVisualGroupShapeProperties(
                new P.NonVisualDrawingProperties { Id = 1, Name = string.Empty },
                new P.NonVisualGroupShapeDrawingProperties(),
                new P.ApplicationNonVisualDrawingProperties()),
            new P.GroupShapeProperties());
        tree.Append(Shape(2, "Title", sample ? $"[SAMPLE] Synthetic slide {index + 1}" : $"Synthetic slide {index + 1}", 700_000, 500_000, 10_500_000, 1_000_000));
        var bodyText = index == 1
            ? revised ? "Revenue 152 / Pipeline 48" : "Revenue 145 / Pipeline 42"
            : index == 3 ? "New synthetic renewal outlook" : "Visual comparison fixture";
        tree.Append(Shape(
            3,
            "Body",
            bodyText,
            revised && index == 1 ? 1_700_000 : 1_200_000,
            revised && index == 1 ? 2_300_000 : 2_000_000,
            8_800_000,
            2_000_000));
        slide.Slide = new P.Slide(new P.CommonSlideData(tree));
        ids.Append(new P.SlideId
        {
            Id = (uint)(256 + index),
            RelationshipId = presentation.GetIdOfPart(slide),
        });
    }
    presentation.Presentation.Save();
}

static P.Shape Shape(uint id, string name, string text, long x, long y, long width, long height)
    => new(
        new P.NonVisualShapeProperties(
            new P.NonVisualDrawingProperties { Id = id, Name = name },
            new P.NonVisualShapeDrawingProperties(),
            new P.ApplicationNonVisualDrawingProperties()),
        new P.ShapeProperties(
            new D.Transform2D(
                new D.Offset { X = x, Y = y },
                new D.Extents { Cx = width, Cy = height })),
        new P.TextBody(
            new D.BodyProperties(),
            new D.ListStyle(),
            new D.Paragraph(new D.Run(new D.Text(text)))));

static void CreateMacroFixture(string path)
{
    using (var document = WordprocessingDocument.Create(path, WordprocessingDocumentType.MacroEnabledDocument))
    {
        var main = document.AddMainDocumentPart();
        main.Document = new W.Document(new W.Body(new W.Paragraph(new W.Run(new W.Text("Synthetic macro fixture"))), new W.SectionProperties()));
        main.Document.Save();
    }
    using var archive = ZipFile.Open(path, ZipArchiveMode.Update);
    var entry = archive.CreateEntry("word/vbaProject.bin");
    using var stream = entry.Open();
    stream.Write(Encoding.ASCII.GetBytes("SYNTHETIC-NONEXECUTABLE-MACRO-BYTES"));
}

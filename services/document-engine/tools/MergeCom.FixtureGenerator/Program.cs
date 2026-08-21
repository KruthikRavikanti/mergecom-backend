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
CreateWord(Path.Combine(output, "visual-word.docx"));
CreateSpreadsheet(Path.Combine(output, "visual-excel.xlsx"), externalLink: false);
CreateSpreadsheet(Path.Combine(output, "external-link-excel.xlsx"), externalLink: true);
CreatePresentation(Path.Combine(output, "visual-powerpoint.pptx"));
CreateMacroFixture(Path.Combine(output, "macro-word.docm"));
File.WriteAllText(Path.Combine(output, "corrupt-office.docx"), "This is intentionally not an OOXML ZIP package.");
Console.WriteLine($"Generated sanitized Office fixtures in {output}");
return 0;

static void CreateWord(string path)
{
    using var document = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
    var main = document.AddMainDocumentPart();
    main.Document = new W.Document(
        new W.Body(
            new W.Paragraph(
                new W.ParagraphProperties(new W.ParagraphStyleId { Val = "Heading1" }),
                new W.Run(new W.Text("Quarterly plan"))),
            new W.Paragraph(new W.Run(new W.Text("Revenue grew from 120 to 145 units."))),
            new W.Paragraph(new W.Run(new W.Text("All names and values in this fixture are synthetic."))),
            new W.Table(
                new W.TableProperties(new W.TableBorders(
                    new W.TopBorder { Val = W.BorderValues.Single },
                    new W.BottomBorder { Val = W.BorderValues.Single },
                    new W.LeftBorder { Val = W.BorderValues.Single },
                    new W.RightBorder { Val = W.BorderValues.Single },
                    new W.InsideHorizontalBorder { Val = W.BorderValues.Single },
                    new W.InsideVerticalBorder { Val = W.BorderValues.Single })),
                new W.TableGrid(new W.GridColumn(), new W.GridColumn()),
                Row("Metric", "Value"),
                Row("Pipeline", "42")),
            new W.SectionProperties(
                new W.PageSize { Width = 12_240, Height = 15_840 },
                new W.PageMargin { Top = 1_440, Right = 1_440, Bottom = 1_440, Left = 1_440 })));
    main.Document.Save();
}

static W.TableRow Row(string left, string right)
    => new(
        new W.TableCell(new W.Paragraph(new W.Run(new W.Text(left)))),
        new W.TableCell(new W.Paragraph(new W.Run(new W.Text(right)))));

static void CreateSpreadsheet(string path, bool externalLink)
{
    using var document = SpreadsheetDocument.Create(path, SpreadsheetDocumentType.Workbook);
    var workbook = document.AddWorkbookPart();
    workbook.Workbook = new S.Workbook();
    var sheets = workbook.Workbook.AppendChild(new S.Sheets());
    var inputs = workbook.AddNewPart<WorksheetPart>("rId1");
    inputs.Worksheet = new S.Worksheet(
        new S.SheetDimension { Reference = "A1:D8" },
        new S.Columns(
            new S.Column { Min = 2, Max = 2, Hidden = true, Width = 12, CustomWidth = true }),
        new S.SheetData(
            SheetRow(1, TextCell("A1", "Metric"), TextCell("B1", "Jan"), TextCell("C1", "Feb"), TextCell("D1", "Total")),
            SheetRow(2, TextCell("A2", "Revenue"), NumberCell("B2", "120"), NumberCell("C2", "145"), FormulaCell("D2", "SUM(B2:C2)", "265")),
            new S.Row(NumberCell("A3", "3")) { RowIndex = 3, Hidden = true },
            SheetRow(4, TextCell("A4", "Pipeline"), NumberCell("B4", "18"), NumberCell("C4", "24"), FormulaCell("D4", "SUM(B4:C4)", "42"))),
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
            SheetRow(1, TextCell("A1", "Summary"), TextCell("B1", "Stored values")),
            SheetRow(2, TextCell("A2", "Total"), NumberCell("B2", "307"))));
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

static void CreatePresentation(string path)
{
    using var document = PresentationDocument.Create(path, PresentationDocumentType.Presentation);
    var presentation = document.AddPresentationPart();
    presentation.Presentation = new P.Presentation(
        new P.SlideMasterIdList(),
        new P.SlideIdList(),
        new P.SlideSize { Cx = 12_192_000, Cy = 6_858_000, Type = P.SlideSizeValues.Screen16x9 },
        new P.NotesSize { Cx = 6_858_000, Cy = 9_144_000 });
    var ids = presentation.Presentation.SlideIdList!;
    for (var index = 0; index < 3; index++)
    {
        var slide = presentation.AddNewPart<SlidePart>($"rId{index + 1}");
        var tree = new P.ShapeTree(
            new P.NonVisualGroupShapeProperties(
                new P.NonVisualDrawingProperties { Id = 1, Name = string.Empty },
                new P.NonVisualGroupShapeDrawingProperties(),
                new P.ApplicationNonVisualDrawingProperties()),
            new P.GroupShapeProperties());
        tree.Append(Shape(2, "Title", $"Synthetic slide {index + 1}", 700_000, 500_000, 10_500_000, 1_000_000));
        tree.Append(Shape(3, "Body", index == 1 ? "Revenue 145 / Pipeline 42" : "Visual comparison fixture", 1_200_000, 2_000_000, 8_800_000, 2_000_000));
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

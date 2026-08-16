using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using D = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;
using S = DocumentFormat.OpenXml.Spreadsheet;
using W = DocumentFormat.OpenXml.Wordprocessing;

namespace MergeCom.DocumentEngine.Tests;

internal sealed class SyntheticOfficePackage : IDisposable
{
    private SyntheticOfficePackage(string path)
    {
        Path = path;
    }

    public string Path { get; }

    public byte[] Bytes => File.ReadAllBytes(Path);

    public static SyntheticOfficePackage Word(string heading = "Synthetic heading")
    {
        var fixture = New(".docx");
        using var document = WordprocessingDocument.Create(fixture.Path, WordprocessingDocumentType.Document);
        var main = document.AddMainDocumentPart();
        main.Document = new W.Document(
            new W.Body(
                new W.Paragraph(
                    new W.ParagraphProperties(new W.ParagraphStyleId { Val = "Heading1" }),
                    new W.Run(new W.Text(heading))),
                new W.Table(
                    new W.TableProperties(),
                    new W.TableGrid(new W.GridColumn()),
                    new W.TableRow(new W.TableCell(new W.Paragraph(new W.Run(new W.Text("Cell")))))),
                new W.SectionProperties()));
        main.Document.Save();
        return fixture;
    }

    public static SyntheticOfficePackage WordParagraphs(params string[] values)
    {
        var fixture = New(".docx");
        using var document = WordprocessingDocument.Create(
            fixture.Path,
            WordprocessingDocumentType.Document);
        var main = document.AddMainDocumentPart();
        var body = new W.Body();
        foreach (var value in values)
        {
            body.Append(new W.Paragraph(new W.Run(new W.Text(value))));
        }

        body.Append(new W.SectionProperties());
        main.Document = new W.Document(body);
        main.Document.Save();
        return fixture;
    }

    public static SyntheticOfficePackage WordWithNestedTable(string value)
    {
        var fixture = New(".docx");
        using var document = WordprocessingDocument.Create(fixture.Path, WordprocessingDocumentType.Document);
        var main = document.AddMainDocumentPart();
        main.Document = new W.Document(
            new W.Body(
                new W.Table(
                    new W.TableProperties(),
                    new W.TableGrid(new W.GridColumn()),
                    new W.TableRow(
                        new W.TableCell(
                            new W.Table(
                                new W.TableProperties(),
                                new W.TableGrid(new W.GridColumn()),
                                new W.TableRow(
                                    new W.TableCell(
                                        new W.Paragraph(new W.Run(new W.Text(value)))))),
                            new W.Paragraph()))),
                new W.SectionProperties()));
        main.Document.Save();
        return fixture;
    }

    public static SyntheticOfficePackage Spreadsheet(string value = "7")
    {
        var fixture = New(".xlsx");
        using var document = SpreadsheetDocument.Create(fixture.Path, SpreadsheetDocumentType.Workbook);
        var workbookPart = document.AddWorkbookPart();
        workbookPart.Workbook = new S.Workbook();
        var worksheetPart = workbookPart.AddNewPart<WorksheetPart>();
        worksheetPart.Worksheet = new S.Worksheet(
            new S.SheetDimension { Reference = "A1:C3" },
            new S.SheetData(new S.Row(new S.Cell
            {
                CellReference = "A1",
                CellValue = new S.CellValue(value),
            })));
        var sheets = workbookPart.Workbook.AppendChild(new S.Sheets());
        sheets.Append(new S.Sheet
        {
            Id = workbookPart.GetIdOfPart(worksheetPart),
            Name = "Inputs",
            SheetId = 1,
        });
        workbookPart.Workbook.Save();
        return fixture;
    }

    public static SyntheticOfficePackage Presentation(string text = "Synthetic slide")
    {
        var fixture = New(".pptx");
        using var document = PresentationDocument.Create(fixture.Path, PresentationDocumentType.Presentation);
        var presentationPart = document.AddPresentationPart();
        presentationPart.Presentation = new P.Presentation();
        var slidePart = presentationPart.AddNewPart<SlidePart>();
        slidePart.Slide = new P.Slide(
            new P.CommonSlideData(
                new P.ShapeTree(
                    new P.NonVisualGroupShapeProperties(
                        new P.NonVisualDrawingProperties { Id = 1, Name = string.Empty },
                        new P.NonVisualGroupShapeDrawingProperties(),
                        new P.ApplicationNonVisualDrawingProperties()),
                    new P.GroupShapeProperties(),
                    new P.Shape(
                        new P.NonVisualShapeProperties(
                            new P.NonVisualDrawingProperties { Id = 2, Name = "Title" },
                            new P.NonVisualShapeDrawingProperties(),
                            new P.ApplicationNonVisualDrawingProperties()),
                        new P.ShapeProperties(),
                        new P.TextBody(
                            new D.BodyProperties(),
                            new D.ListStyle(),
                            new D.Paragraph(new D.Run(new D.Text(text))))))));
        var slideIds = presentationPart.Presentation.AppendChild(new P.SlideIdList());
        slideIds.Append(new P.SlideId
        {
            Id = 256,
            RelationshipId = presentationPart.GetIdOfPart(slidePart),
        });
        presentationPart.Presentation.Save();
        return fixture;
    }

    public static SyntheticOfficePackage Corrupt()
    {
        var fixture = New(".docx");
        File.WriteAllBytes(fixture.Path, [0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
        return fixture;
    }

    public static SyntheticOfficePackage Encrypted()
    {
        var fixture = Word();
        var bytes = fixture.Bytes;
        SetEncryptedFlag(bytes, 0x04034b50, 6);
        SetEncryptedFlag(bytes, 0x02014b50, 8);
        File.WriteAllBytes(fixture.Path, bytes);
        return fixture;
    }

    public static SyntheticOfficePackage WithEntry(string name, byte[] content)
    {
        var fixture = New(".docx");
        using var archive = ZipFile.Open(fixture.Path, ZipArchiveMode.Create);
        WriteEntry(archive, "[Content_Types].xml", ContentTypes);
        WriteEntry(archive, "_rels/.rels", RootRelationships);
        WriteEntry(archive, name, content);
        return fixture;
    }

    public static SyntheticOfficePackage WordWithFeature(
        string name,
        byte[] content,
        string heading = "Synthetic heading")
    {
        var fixture = Word(heading);
        using var archive = ZipFile.Open(fixture.Path, ZipArchiveMode.Update);
        WriteEntry(archive, name, content);
        return fixture;
    }

    public static SyntheticOfficePackage WordWithExternalRelationship()
    {
        var fixture = Word();
        using var archive = ZipFile.Open(fixture.Path, ZipArchiveMode.Update);
        var rels = archive.GetEntry("_rels/.rels")!;
        rels.Delete();
        WriteEntry(
            archive,
            "_rels/.rels",
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
              <Relationship Id="rExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/data" TargetMode="External" />
            </Relationships>
            """);
        return fixture;
    }

    public static SyntheticOfficePackage WordWithContentTypes(string contentTypes)
        => WordWithReplacedEntry("[Content_Types].xml", contentTypes);

    public static SyntheticOfficePackage WordWithRootRelationships(string relationships)
        => WordWithReplacedEntry("_rels/.rels", relationships);

    public void Dispose()
    {
        try
        {
            File.Delete(Path);
        }
        catch (IOException)
        {
        }
    }

    private static SyntheticOfficePackage New(string extension)
    {
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"mergecom-fixture-{Guid.NewGuid():N}{extension}");
        return new SyntheticOfficePackage(path);
    }

    private static void SetEncryptedFlag(byte[] bytes, uint signature, int flagOffset)
    {
        for (var index = 0; index <= bytes.Length - sizeof(uint); index++)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(index, sizeof(uint))) != signature)
            {
                continue;
            }

            var flags = BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(index + flagOffset, sizeof(ushort)));
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(index + flagOffset, sizeof(ushort)), (ushort)(flags | 0x0001));
        }
    }

    private static SyntheticOfficePackage WordWithReplacedEntry(string name, string content)
    {
        var fixture = Word();
        using var archive = ZipFile.Open(fixture.Path, ZipArchiveMode.Update);
        archive.GetEntry(name)!.Delete();
        WriteEntry(archive, name, content);
        return fixture;
    }

    private static void WriteEntry(ZipArchive archive, string name, string content)
        => WriteEntry(archive, name, Encoding.UTF8.GetBytes(content));

    private static void WriteEntry(ZipArchive archive, string name, byte[] content)
    {
        var entry = archive.CreateEntry(name, CompressionLevel.SmallestSize);
        using var stream = entry.Open();
        stream.Write(content);
    }

    private const string ContentTypes = """
        <?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
          <Default Extension="xml" ContentType="application/xml" />
        </Types>
        """;

    private const string RootRelationships = """
        <?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
        </Relationships>
        """;
}

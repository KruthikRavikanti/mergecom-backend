using System.Text.Json.Serialization;

namespace MergeCom.DocumentEngine;

public sealed record InspectionWarning(
    string Code,
    string Message,
    string? Part,
    string Severity = "warning");

public sealed record ValidationIssue(
    string Code,
    string Description,
    string? Part,
    string? Path);

public sealed record PackageSummary(
    int EntryCount,
    long CompressedBytes,
    long ExpandedBytes,
    int RelationshipCount,
    int XmlPartCount,
    bool HasMacros,
    bool HasDigitalSignatures,
    bool HasExternalLinks,
    bool HasEmbeddedObjects);

public sealed record PresentationSlide(
    int Position,
    string RelationshipId,
    string Part,
    string? LayoutPart,
    string? MasterPart,
    int ShapeCount,
    int RelationshipCount,
    bool HasNotes,
    IReadOnlyList<PresentationShape> Shapes);

public sealed record PresentationShape(
    string Id,
    int Position,
    string Name,
    string Kind,
    string Text,
    string MarkupHash,
    string? AssetHash,
    PresentationBounds? Bounds);

public sealed record PresentationBounds(long X, long Y, long Width, long Height);

public sealed record PresentationInventory(
    long Width,
    long Height,
    IReadOnlyList<PresentationSlide> Slides);

public sealed record SpreadsheetSheet(
    int Position,
    uint? SheetId,
    string Name,
    string RelationshipId,
    string Visibility,
    string? Dimension,
    int TableCount,
    int ChartCount,
    bool HasDrawings,
    IReadOnlyList<string> MergedRanges,
    IReadOnlyList<uint> HiddenRows,
    IReadOnlyList<string> HiddenColumns,
    IReadOnlyList<SpreadsheetCell> Cells);

public sealed record SpreadsheetCell(
    string Reference,
    string Value,
    string? Formula,
    string DataType,
    uint? StyleIndex);

public sealed record SpreadsheetDefinedName(
    string Name,
    string Formula,
    uint? LocalSheetId);

public sealed record SpreadsheetInventory(
    IReadOnlyList<SpreadsheetSheet> Sheets,
    IReadOnlyList<SpreadsheetDefinedName> DefinedNames,
    int TableCount,
    int ChartCount);

public sealed record WordInventory(
    int SectionCount,
    int ParagraphCount,
    int HeadingCount,
    int TableCount,
    int HeaderCount,
    int FooterCount,
    int FootnoteCount,
    int EndnoteCount,
    int CommentCount,
    int ImageCount,
    int TrackedChangeCount,
    IReadOnlyList<WordBlock> Blocks);

public sealed record WordBlock(
    string Path,
    string Kind,
    string Text,
    string? Style,
    string MarkupHash);

public sealed record SnapshotEnvelope(
    string SchemaVersion,
    string ParserVersion,
    string FileType,
    string SourceSha256,
    PackageSummary Package,
    IReadOnlyList<InspectionWarning> Warnings,
    IReadOnlyList<string> UnsupportedFeatures,
    IReadOnlyList<ValidationIssue> ValidationErrors,
    string StableHash,
    object FormatPayload);

public sealed record InspectionResult(
    string Outcome,
    string? FailureCode,
    SnapshotEnvelope Snapshot);

internal sealed class PackageFacts
{
    public int EntryCount { get; set; }

    public long CompressedBytes { get; set; }

    public long ExpandedBytes { get; set; }

    public int RelationshipCount { get; set; }

    public int XmlPartCount { get; set; }

    public bool HasMacros { get; set; }

    public bool HasDigitalSignatures { get; set; }

    public bool HasExternalLinks { get; set; }

    public bool HasEmbeddedObjects { get; set; }

    public List<InspectionWarning> Warnings { get; } = [];

    public HashSet<string> UnsupportedFeatures { get; } = new(StringComparer.Ordinal);

    public PackageSummary Summary() => new(
        EntryCount,
        CompressedBytes,
        ExpandedBytes,
        RelationshipCount,
        XmlPartCount,
        HasMacros,
        HasDigitalSignatures,
        HasExternalLinks,
        HasEmbeddedObjects);
}

internal sealed class InspectionRejectedException(
    string code,
    string message,
    string outcome = "quarantined",
    string? part = null,
    Exception? innerException = null) : Exception(message, innerException)
{
    public string Code { get; } = code;

    public string Outcome { get; } = outcome;

    public string? Part { get; } = part;
}

internal sealed class SemanticBudget(int maxItems, int maxTextCharacters)
{
    private int items;
    private int textCharacters;

    public bool Truncated { get; private set; }

    public bool TryCapture(string?[] values, out string?[] captured)
    {
        captured = new string?[values.Length];
        if (items >= maxItems)
        {
            Truncated = true;
            return false;
        }

        items++;
        for (var index = 0; index < values.Length; index++)
        {
            var value = values[index];
            if (value is null)
            {
                continue;
            }

            var remaining = maxTextCharacters - textCharacters;
            if (remaining <= 0)
            {
                Truncated = true;
                captured[index] = string.Empty;
                continue;
            }

            if (value.Length > remaining)
            {
                Truncated = true;
                captured[index] = value[..remaining];
                textCharacters = maxTextCharacters;
                continue;
            }

            captured[index] = value;
            textCharacters += value.Length;
        }

        return true;
    }
}

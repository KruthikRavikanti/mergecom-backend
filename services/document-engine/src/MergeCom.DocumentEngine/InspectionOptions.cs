namespace MergeCom.DocumentEngine;

public sealed class InspectionOptions
{
    public const string SectionName = "Inspection";

    public string InternalToken { get; set; } = "mergecom-local-document-engine-token";

    public long MaxInputBytes { get; set; } = 100 * 1024 * 1024;

    public int MaxEntries { get; set; } = 5_000;

    public long MaxPartBytes { get; set; } = 64 * 1024 * 1024;

    public long MaxExpandedBytes { get; set; } = 512 * 1024 * 1024;

    public double MaxCompressionRatio { get; set; } = 200;

    public long MaxXmlCharacters { get; set; } = 16 * 1024 * 1024;

    public int MaxXmlDepth { get; set; } = 128;

    public int MaxValidationErrors { get; set; } = 100;

    public int MaxSemanticItems { get; set; } = 50_000;

    public int MaxSemanticTextCharacters { get; set; } = 1 * 1024 * 1024;

    public long MaxComparisonInputBytes { get; set; } = 8 * 1024 * 1024;

    public long MaxMergeInputBytes { get; set; } = 300 * 1024 * 1024;

    public string TempRoot { get; set; } = Path.Combine(Path.GetTempPath(), "mergecom-document-engine");
}

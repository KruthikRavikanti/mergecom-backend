namespace MergeCom.DocumentEngine;

public sealed record MergeAnalysisItem(
    string Id,
    string Classification,
    string Category,
    string Confidence,
    string Label,
    string Path,
    string Explanation,
    string? OursChange,
    string? TheirsChange,
    bool AutomaticallyResolved);

public sealed record MergeAnalysisBlocker(
    string Code,
    string Category,
    string? Path,
    string Explanation);

public sealed record MergeAnalysis(
    string SchemaVersion,
    bool AutomaticMergeEnabled,
    bool AutomaticMergeEligible,
    IReadOnlyDictionary<string, int> Summary,
    IReadOnlyList<MergeAnalysisItem> Items,
    IReadOnlyList<MergeAnalysisBlocker> Blockers);

public sealed record MergeResult(
    string MergeSchemaVersion,
    string ParserVersion,
    string EngineVersion,
    string BaseSourceSha256,
    string OursSourceSha256,
    string TheirsSourceSha256,
    string FileType,
    string Outcome,
    string? Strategy,
    string? FailureCode,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> AppliedPaths,
    MergeAnalysis Analysis,
    string? CandidateSha256,
    long? CandidateByteSize,
    byte[]? CandidateBytes,
    string StableHash);

namespace MergeCom.DocumentEngine;

public sealed record SnapshotComparisonRequest(
    SnapshotEnvelope? BaseSnapshot,
    SnapshotEnvelope? TargetSnapshot);

public sealed record ComparisonChange(
    string Id,
    string ChangeType,
    string Category,
    string Impact,
    string EntityType,
    string Label,
    string Path,
    string? Before,
    string? After);

public sealed record ComparisonResult(
    string ComparisonSchemaVersion,
    string ParserVersion,
    string EngineVersion,
    string BaseSourceSha256,
    string TargetSourceSha256,
    string FileType,
    bool ByteEqual,
    bool? SemanticEqual,
    string Completeness,
    IReadOnlyDictionary<string, int> Summary,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<ComparisonChange> Changes,
    string StableHash);

public sealed class InvalidComparisonException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

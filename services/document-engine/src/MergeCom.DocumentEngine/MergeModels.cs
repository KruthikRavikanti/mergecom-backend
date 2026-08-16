namespace MergeCom.DocumentEngine;

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
    string? CandidateSha256,
    long? CandidateByteSize,
    byte[]? CandidateBytes,
    string StableHash);

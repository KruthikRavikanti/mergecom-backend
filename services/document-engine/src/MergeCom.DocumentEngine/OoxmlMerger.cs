using System.Security.Cryptography;
using System.Text.Json;
using System.IO.Compression;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using W = DocumentFormat.OpenXml.Wordprocessing;

namespace MergeCom.DocumentEngine;

public sealed class OoxmlMerger(InspectionOptions options, OoxmlComparator comparator)
{
    public const string MergeSchemaVersion = "1.0.0";
    public const string EngineVersion = "1.0.0";

    private static readonly JsonSerializerOptions StableJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public MergeResult Merge(
        string basePath,
        string oursPath,
        string theirsPath,
        string fileType,
        string baseSha256,
        string oursSha256,
        string theirsSha256,
        string candidatePath)
    {
        var inspector = new OoxmlInspector(options);
        var baseInspection = inspector.Inspect(basePath, fileType, baseSha256);
        var oursInspection = inspector.Inspect(oursPath, fileType, oursSha256);
        var theirsInspection = inspector.Inspect(theirsPath, fileType, theirsSha256);
        var inspections = new[] { baseInspection, oursInspection, theirsInspection };
        if (inspections.Any(result => result.Outcome != "completed"))
        {
            return Manual("merge_source_rejected", [
                "At least one source package could not be inspected safely.",
            ]);
        }

        if (inspections.Any(result =>
                result.Snapshot.UnsupportedFeatures.Count > 0
                || result.Snapshot.ValidationErrors.Count > 0))
        {
            return Manual("merge_coverage_incomplete", [
                "Automatic merge requires complete semantic coverage and validation-clean inputs.",
            ]);
        }

        if (oursSha256 == theirsSha256)
        {
            return ExactCandidate(oursPath, "identical_heads", []);
        }

        if (baseSha256 == oursSha256)
        {
            return ExactCandidate(theirsPath, "fast_forward_theirs", []);
        }

        if (baseSha256 == theirsSha256)
        {
            return ExactCandidate(oursPath, "retain_ours", []);
        }

        var oursComparison = comparator.Compare(
            baseInspection.Snapshot,
            oursInspection.Snapshot);
        var theirsComparison = comparator.Compare(
            baseInspection.Snapshot,
            theirsInspection.Snapshot);
        if (fileType != "word_document")
        {
            return Manual("merge_format_requires_manual_resolution", [
                "Automatic divergent merge is currently limited to validated Word text changes.",
            ]);
        }

        if (!SupportingPartsEqual(basePath, oursPath, theirsPath))
        {
            return Manual("merge_supporting_parts_changed", [
                "At least one package part outside the modeled Word document changed.",
            ]);
        }

        if (!MergeableChanges(oursComparison.Changes)
            || !MergeableChanges(theirsComparison.Changes))
        {
            return Manual("merge_change_shape_unsupported", [
                "Automatic merge accepts modified Word paragraph text only.",
            ]);
        }

        var oursPaths = oursComparison.Changes
            .Select(change => change.Path)
            .ToHashSet(StringComparer.Ordinal);
        var theirsPaths = theirsComparison.Changes
            .Select(change => change.Path)
            .ToHashSet(StringComparer.Ordinal);
        if (oursPaths.Overlaps(theirsPaths))
        {
            return Manual("merge_changes_overlap", [
                "Both versions changed at least one of the same Word paragraphs.",
            ]);
        }

        using var baseDocument = OpenWord(basePath, false);
        using var oursDocument = OpenWord(oursPath, false);
        using var theirsDocument = OpenWord(theirsPath, false);
        var baseBlocks = WordBlocks(baseDocument);
        var oursBlocks = WordBlocks(oursDocument);
        var theirsBlocks = WordBlocks(theirsDocument);
        if (!ChangesOnlyText(baseBlocks, oursBlocks, oursPaths)
            || !ChangesOnlyText(baseBlocks, theirsBlocks, theirsPaths))
        {
            return Manual("merge_word_markup_unsupported", [
                "A changed paragraph also altered markup or text-node structure.",
            ]);
        }

        File.Copy(oursPath, candidatePath, false);
        using (var candidateDocument = OpenWord(candidatePath, true))
        {
            var candidateBlocks = WordBlocks(candidateDocument);
            foreach (var path in theirsPaths.Order(StringComparer.Ordinal))
            {
                if (!candidateBlocks.TryGetValue(path, out var candidateBlock)
                    || !theirsBlocks.TryGetValue(path, out var theirsBlock))
                {
                    return CandidateManual(
                        candidatePath,
                        "merge_candidate_path_missing",
                        ["A changed Word paragraph could not be located in the candidate."]);
                }

                candidateBlock.InsertAfterSelf(theirsBlock.CloneNode(true));
                candidateBlock.Remove();
            }

            candidateDocument.MainDocumentPart?.Document?.Save();
        }

        var candidateBytes = File.ReadAllBytes(candidatePath);
        var candidateSha256 = Hash(candidateBytes);
        var candidateInspection = inspector.Inspect(candidatePath, fileType, candidateSha256);
        if (candidateInspection.Outcome != "completed"
            || candidateInspection.Snapshot.UnsupportedFeatures.Count > 0
            || candidateInspection.Snapshot.ValidationErrors.Count > 0)
        {
            return CandidateManual(
                candidatePath,
                "merge_candidate_validation_failed",
                ["The generated candidate did not pass bounded inspection and Open XML validation."]);
        }

        var candidateComparison = comparator.Compare(
            baseInspection.Snapshot,
            candidateInspection.Snapshot);
        var expectedChanges = oursComparison.Changes
            .Concat(theirsComparison.Changes)
            .Select(ChangeSignature)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var actualChanges = candidateComparison.Changes
            .Select(ChangeSignature)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (!expectedChanges.SequenceEqual(actualChanges, StringComparer.Ordinal))
        {
            return CandidateManual(
                candidatePath,
                "merge_candidate_verification_failed",
                ["The generated candidate did not reproduce the exact union of both change sets."]);
        }

        return Candidate(
            candidateBytes,
            "disjoint_word_text",
            theirsPaths.Order(StringComparer.Ordinal).ToArray());

        MergeResult Manual(string failureCode, IReadOnlyList<string> warnings)
            => Build("manual_resolution_required", null, failureCode, warnings, [], null);

        MergeResult CandidateManual(
            string path,
            string failureCode,
            IReadOnlyList<string> warnings)
            => Build(
                "manual_resolution_required",
                null,
                failureCode,
                warnings,
                [],
                File.ReadAllBytes(path));

        MergeResult ExactCandidate(
            string path,
            string strategy,
            IReadOnlyList<string> appliedPaths)
            => Candidate(File.ReadAllBytes(path), strategy, appliedPaths);

        MergeResult Candidate(
            byte[] bytes,
            string strategy,
            IReadOnlyList<string> appliedPaths)
            => Build("completed", strategy, null, [], appliedPaths, bytes);

        MergeResult Build(
            string outcome,
            string? strategy,
            string? failureCode,
            IReadOnlyList<string> warnings,
            IReadOnlyList<string> appliedPaths,
            byte[]? candidateBytes)
        {
            var candidateSha256 = candidateBytes is null ? null : Hash(candidateBytes);
            var basis = new StableMergeBasis(
                MergeSchemaVersion,
                OoxmlInspector.ParserVersion,
                EngineVersion,
                baseSha256,
                oursSha256,
                theirsSha256,
                fileType,
                outcome,
                strategy,
                failureCode,
                warnings,
                appliedPaths,
                candidateSha256,
                candidateBytes?.LongLength);
            var stableHash = Hash(JsonSerializer.SerializeToUtf8Bytes(basis, StableJsonOptions));
            return new(
                basis.MergeSchemaVersion,
                basis.ParserVersion,
                basis.EngineVersion,
                basis.BaseSourceSha256,
                basis.OursSourceSha256,
                basis.TheirsSourceSha256,
                basis.FileType,
                basis.Outcome,
                basis.Strategy,
                basis.FailureCode,
                basis.Warnings,
                basis.AppliedPaths,
                basis.CandidateSha256,
                basis.CandidateByteSize,
                candidateBytes,
                stableHash);
        }
    }

    private WordprocessingDocument OpenWord(string path, bool editable)
        => WordprocessingDocument.Open(path, editable, new OpenSettings
        {
            AutoSave = false,
            MaxCharactersInPart = options.MaxXmlCharacters,
        });

    private static bool MergeableChanges(IReadOnlyList<ComparisonChange> changes)
        => changes.Count > 0 && changes.All(change =>
            change.ChangeType == "modified"
            && change.Category == "content"
            && change.EntityType is "paragraph" or "table_cell"
            && change.Path.StartsWith("/body/", StringComparison.Ordinal));

    private static bool SupportingPartsEqual(params string[] packagePaths)
    {
        var inventories = packagePaths.Select(PackageInventory).ToArray();
        return inventories.Skip(1).All(inventory =>
            inventories[0].Count == inventory.Count
            && inventories[0].All(item =>
                inventory.TryGetValue(item.Key, out var hash) && hash == item.Value));
    }

    private static IReadOnlyDictionary<string, string> PackageInventory(string packagePath)
    {
        using var archive = ZipFile.OpenRead(packagePath);
        return archive.Entries
            .Where(entry => !entry.FullName.EndsWith("/", StringComparison.Ordinal)
                && entry.FullName != "word/document.xml"
                && entry.FullName != "[Content_Types].xml"
                && entry.FullName != "_rels/.rels")
            .ToDictionary(
                entry => entry.FullName,
                entry =>
                {
                    using var stream = entry.Open();
                    return Convert.ToHexStringLower(SHA256.HashData(stream));
                },
                StringComparer.Ordinal);
    }

    private static bool ChangesOnlyText(
        IReadOnlyDictionary<string, W.Paragraph> baseBlocks,
        IReadOnlyDictionary<string, W.Paragraph> targetBlocks,
        IReadOnlySet<string> changedPaths)
    {
        foreach (var path in changedPaths)
        {
            if (!baseBlocks.TryGetValue(path, out var before)
                || !targetBlocks.TryGetValue(path, out var after)
                || before.Descendants<W.Text>().Count() == 0
                || before.Descendants<W.Text>().Count() != after.Descendants<W.Text>().Count()
                || TextlessMarkup(before) != TextlessMarkup(after))
            {
                return false;
            }
        }

        return true;
    }

    private static string TextlessMarkup(W.Paragraph paragraph)
    {
        var clone = (W.Paragraph)paragraph.CloneNode(true);
        foreach (var text in clone.Descendants<W.Text>())
        {
            text.Text = string.Empty;
        }

        return clone.OuterXml;
    }

    private static IReadOnlyDictionary<string, W.Paragraph> WordBlocks(
        WordprocessingDocument document)
    {
        var body = document.MainDocumentPart?.Document?.Body
            ?? throw new InvalidDataException("The Word body is missing.");
        return body.Descendants<W.Paragraph>()
            .ToDictionary(paragraph => WordBlockPath(body, paragraph), StringComparer.Ordinal);
    }

    private static string WordBlockPath(W.Body body, W.Paragraph paragraph)
    {
        var segments = new Stack<string>();
        OpenXmlElement current = paragraph;
        while (!ReferenceEquals(current, body))
        {
            var parent = current.Parent
                ?? throw new InvalidDataException("A Word body block has no parent.");
            var position = 0;
            foreach (var sibling in parent.ChildElements)
            {
                if (sibling.LocalName == current.LocalName)
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

    private static string ChangeSignature(ComparisonChange change)
        => JsonSerializer.Serialize(new
        {
            change.ChangeType,
            change.Category,
            change.EntityType,
            change.Path,
            change.Before,
            change.After,
        }, StableJsonOptions);

    private static string Hash(byte[] bytes)
        => Convert.ToHexStringLower(SHA256.HashData(bytes));

    private sealed record StableMergeBasis(
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
        long? CandidateByteSize);
}

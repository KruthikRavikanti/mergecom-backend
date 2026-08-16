using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using D = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

namespace MergeCom.DocumentEngine;

internal sealed record PowerPointMergeOutcome(
    MergeAnalysis Analysis,
    string Outcome,
    string? Strategy,
    string? FailureCode,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> AppliedPaths,
    byte[]? CandidateBytes);

internal sealed class PowerPointMerger(
    InspectionOptions options,
    OoxmlComparator comparator)
{
    private static readonly JsonSerializerOptions StableJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public PowerPointMergeOutcome Merge(
        string basePath,
        string oursPath,
        string theirsPath,
        string candidatePath,
        InspectionResult baseInspection,
        InspectionResult oursInspection,
        InspectionResult theirsInspection,
        ComparisonResult oursComparison,
        ComparisonResult theirsComparison,
        MergeAnalysis initialAnalysis)
    {
        var blockers = initialAnalysis.Blockers.ToList();
        var changePaths = oursComparison.Changes
            .Concat(theirsComparison.Changes)
            .Select(change => change.Path)
            .Distinct(StringComparer.Ordinal)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var item in initialAnalysis.Items.Where(item => item.Classification == "true_conflict"))
        {
            blockers.Add(new(
                "incompatible_target_changes",
                item.Category,
                item.Path,
                "Both versions changed the same semantic target incompatibly."));
        }

        if (blockers.Count > 0)
        {
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                blockers.Any(blocker => blocker.Code == "incompatible_target_changes")
                    ? "powerpoint_changes_conflict"
                    : "powerpoint_package_change_unsupported",
                ["Automatic merge stopped because the analysis contains package or semantic blockers."]);
        }

        if (changePaths.Count == 0
            || !MergeableChanges(oursComparison.Changes)
            || !MergeableChanges(theirsComparison.Changes))
        {
            blockers.Add(new(
                "unsupported_powerpoint_change",
                "unknown",
                null,
                "Automatic merge accepts modified text in stable PowerPoint shapes only."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "powerpoint_change_unsupported",
                ["At least one PowerPoint edit is outside the text-shape allowlist."]);
        }

        if (!SupportingPartsEqual(basePath, oursPath, theirsPath))
        {
            blockers.Add(new(
                "powerpoint_relationship_integrity_unproven",
                "relationships",
                null,
                "A package part other than slide XML changed, so relationship integrity cannot be proven."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "powerpoint_supporting_parts_changed",
                ["PowerPoint relationships, media, layouts, themes, and other supporting parts must remain byte-identical."]);
        }

        using var baseDocument = OpenPresentation(basePath, false);
        using var oursDocument = OpenPresentation(oursPath, false);
        using var theirsDocument = OpenPresentation(theirsPath, false);
        var baseShapes = ShapeMap(baseDocument);
        var oursShapes = ShapeMap(oursDocument);
        var theirsShapes = ShapeMap(theirsDocument);
        if (!StableShapeIdentity(baseShapes, oursShapes, theirsShapes))
        {
            blockers.Add(new(
                "ambiguous_shape_identity",
                "shape",
                null,
                "Slide order, shape order, or stable shape identifiers differ between the inputs."));
            var items = initialAnalysis.Items
                .Select(item => changePaths.Contains(item.Path)
                    ? item with
                    {
                        Classification = "ambiguous",
                        Confidence = "low",
                        Explanation = "This shape could not be matched with high confidence across all three inputs.",
                    }
                    : item)
                .ToArray();
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, items, blockers),
                "powerpoint_shape_match_ambiguous",
                ["Automatic merge requires stable slide order and unique shape identifiers."]);
        }

        foreach (var path in changePaths.Order(StringComparer.Ordinal))
        {
            if (!baseShapes.TryGetValue(path, out var before)
                || !oursShapes.TryGetValue(path, out var ours)
                || !theirsShapes.TryGetValue(path, out var theirs)
                || !ChangedShapeIsTextOnly(before.Shape, ours.Shape)
                || !ChangedShapeIsTextOnly(before.Shape, theirs.Shape))
            {
                blockers.Add(new(
                    "powerpoint_shape_markup_unsupported",
                    "shape",
                    path,
                    "A changed shape altered formatting, geometry, node structure, or non-text content."));
            }
        }

        if (blockers.Count > 0)
        {
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "powerpoint_shape_markup_unsupported",
                ["Changed PowerPoint shapes must retain identical non-text markup and text-node structure."]);
        }

        var oursPaths = oursComparison.Changes
            .Select(change => change.Path)
            .ToHashSet(StringComparer.Ordinal);
        var theirsPaths = theirsComparison.Changes
            .Select(change => change.Path)
            .ToHashSet(StringComparer.Ordinal);
        var overlappingPaths = oursPaths.Intersect(theirsPaths, StringComparer.Ordinal).ToArray();
        if (overlappingPaths.Any(path => oursShapes[path].Shape.OuterXml != theirsShapes[path].Shape.OuterXml))
        {
            foreach (var path in overlappingPaths)
            {
                blockers.Add(new(
                    "incompatible_shape_text",
                    "text",
                    path,
                    "Both versions changed the same shape text differently."));
            }
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "powerpoint_changes_conflict",
                ["Both versions changed at least one of the same PowerPoint shapes incompatibly."]);
        }

        var eligibleItems = initialAnalysis.Items
            .Select(item => changePaths.Contains(item.Path)
                ? item with
                {
                    Category = "text",
                    Confidence = "high",
                    Explanation = item.Classification == "compatible_overlap"
                        ? "Both versions made the same text-only change to a stable shape."
                        : "Only one version changed text in this stable shape; all relationships remain unchanged.",
                    AutomaticallyResolved = false,
                }
                : item)
            .ToArray();
        var analysis = MergeAnalysisBuilder.WithDecision(initialAnalysis, true, eligibleItems, blockers);
        if (!analysis.AutomaticMergeEnabled)
        {
            return Manual(
                analysis,
                "powerpoint_automatic_merge_disabled",
                ["The changes are eligible, but PowerPoint automatic merge is disabled for this organization."]);
        }

        var appliedPaths = theirsPaths
            .Except(oursPaths, StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();
        File.Copy(oursPath, candidatePath, false);
        using (var candidateDocument = OpenPresentation(candidatePath, true))
        {
            var candidateShapes = ShapeMap(candidateDocument);
            foreach (var path in appliedPaths)
            {
                if (!candidateShapes.TryGetValue(path, out var candidateShape)
                    || !theirsShapes.TryGetValue(path, out var theirsShape))
                {
                    return Manual(
                        analysis,
                        "powerpoint_candidate_path_missing",
                        ["An approved PowerPoint shape could not be located in the candidate."]);
                }

                candidateShape.Shape.InsertAfterSelf(theirsShape.Shape.CloneNode(true));
                candidateShape.Shape.Remove();
                (candidateShape.SlidePart.Slide
                    ?? throw new InvalidDataException("The candidate slide XML is missing."))
                    .Save();
            }
        }

        var candidateBytes = File.ReadAllBytes(candidatePath);
        var inspector = new OoxmlInspector(options);
        var candidateInspection = inspector.Inspect(
            candidatePath,
            "presentation",
            Convert.ToHexStringLower(SHA256.HashData(candidateBytes)));
        if (candidateInspection.Outcome != "completed"
            || candidateInspection.Snapshot.UnsupportedFeatures.Count > 0
            || candidateInspection.Snapshot.ValidationErrors.Count > 0)
        {
            blockers.Add(new(
                "candidate_package_validation_failed",
                "relationships",
                null,
                "The generated package failed bounded inspection or Open XML validation."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(analysis, false, blockers: blockers),
                "powerpoint_candidate_validation_failed",
                ["The generated candidate was discarded after package validation failed."]);
        }

        var mutableSlides = appliedPaths
            .Select(path => oursShapes[path].SlidePart.Uri.ToString().TrimStart('/'))
            .ToHashSet(StringComparer.Ordinal);
        if (!UntouchedPartsEqual(oursPath, candidatePath, mutableSlides))
        {
            blockers.Add(new(
                "candidate_byte_preservation_failed",
                "relationships",
                null,
                "A package part outside the approved slide set changed while generating the candidate."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(analysis, false, blockers: blockers),
                "powerpoint_candidate_preservation_failed",
                ["The generated candidate was discarded because an untouched package part changed."]);
        }

        var candidateComparison = comparator.Compare(
            baseInspection.Snapshot,
            candidateInspection.Snapshot);
        var expectedChanges = oursComparison.Changes
            .Concat(theirsComparison.Changes)
            .GroupBy(change => change.Path, StringComparer.Ordinal)
            .Select(group => group.Last())
            .Select(ChangeSignature)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var actualChanges = candidateComparison.Changes
            .Select(ChangeSignature)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (!expectedChanges.SequenceEqual(actualChanges, StringComparer.Ordinal))
        {
            blockers.Add(new(
                "candidate_semantic_union_failed",
                "text",
                null,
                "The generated candidate did not reproduce the exact union of both semantic change sets."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(analysis, false, blockers: blockers),
                "powerpoint_candidate_verification_failed",
                ["The generated candidate was discarded after semantic-union verification failed."]);
        }

        var oursSlides = oursPaths.Select(path => oursShapes[path].SlidePart.Uri.ToString()).ToHashSet(StringComparer.Ordinal);
        var theirsSlides = theirsPaths.Select(path => theirsShapes[path].SlidePart.Uri.ToString()).ToHashSet(StringComparer.Ordinal);
        analysis = MergeAnalysisBuilder.WithDecision(
            analysis,
            true,
            analysis.Items.Select(item => changePaths.Contains(item.Path)
                ? item with { AutomaticallyResolved = true }
                : item).ToArray());
        return new(
            analysis,
            "completed",
            oursSlides.Overlaps(theirsSlides)
                ? "disjoint_powerpoint_shapes"
                : "disjoint_powerpoint_slides",
            null,
            [],
            appliedPaths,
            candidateBytes);
    }

    private PowerPointMergeOutcome Manual(
        MergeAnalysis analysis,
        string failureCode,
        IReadOnlyList<string> warnings)
        => new(
            analysis,
            "manual_resolution_required",
            null,
            failureCode,
            warnings,
            [],
            null);

    private PresentationDocument OpenPresentation(string path, bool editable)
        => PresentationDocument.Open(path, editable, new OpenSettings
        {
            AutoSave = false,
            MaxCharactersInPart = options.MaxXmlCharacters,
        });

    private static bool MergeableChanges(IReadOnlyList<ComparisonChange> changes)
        => changes.Count > 0 && changes.All(change =>
            change.ChangeType == "modified"
            && change.Category == "content"
            && change.EntityType == "slide_shape"
            && change.Path.StartsWith("/presentation/slides/", StringComparison.Ordinal));

    private static bool ChangedShapeIsTextOnly(P.Shape before, P.Shape after)
    {
        var beforeText = before.Descendants<D.Text>().ToArray();
        var afterText = after.Descendants<D.Text>().ToArray();
        return beforeText.Length > 0
            && beforeText.Length == afterText.Length
            && TextlessMarkup(before) == TextlessMarkup(after);
    }

    private static string TextlessMarkup(P.Shape shape)
    {
        var clone = (P.Shape)shape.CloneNode(true);
        foreach (var text in clone.Descendants<D.Text>())
        {
            text.Text = string.Empty;
        }

        return clone.OuterXml;
    }

    private static IReadOnlyDictionary<string, ShapeReference> ShapeMap(
        PresentationDocument document)
    {
        var presentationPart = document.PresentationPart
            ?? throw new InvalidDataException("The presentation main part is missing.");
        var slideIds = presentationPart.Presentation?.SlideIdList?.Elements<P.SlideId>().ToArray()
            ?? [];
        var result = new Dictionary<string, ShapeReference>(StringComparer.Ordinal);
        for (var slideIndex = 0; slideIndex < slideIds.Length; slideIndex++)
        {
            var relationshipId = slideIds[slideIndex].RelationshipId?.Value
                ?? throw new InvalidDataException("A slide relationship is missing.");
            if (presentationPart.GetPartById(relationshipId) is not SlidePart slidePart)
            {
                throw new InvalidDataException("A slide relationship does not resolve.");
            }

            var slide = slidePart.Slide
                ?? throw new InvalidDataException("A slide XML root is missing.");
            var shapeTree = slide.CommonSlideData?.ShapeTree;
            if (shapeTree is null)
            {
                continue;
            }

            var shapePosition = 0;
            foreach (var shape in shapeTree.ChildElements.OfType<P.Shape>())
            {
                shapePosition++;
                var id = shape.NonVisualShapeProperties?.NonVisualDrawingProperties?.Id?.Value.ToString();
                if (string.IsNullOrWhiteSpace(id))
                {
                    throw new InvalidDataException("A PowerPoint shape has no stable identifier.");
                }

                var path = $"/presentation/slides/{slidePart.Uri.ToString().TrimStart('/')}/shapes/{id}";
                if (!result.TryAdd(path, new(slideIndex + 1, shapePosition, slidePart, shape)))
                {
                    throw new InvalidDataException("A PowerPoint shape identifier is duplicated.");
                }
            }
        }

        return result;
    }

    private static bool StableShapeIdentity(params IReadOnlyDictionary<string, ShapeReference>[] maps)
        => maps.Skip(1).All(map =>
            maps[0].Count == map.Count
            && maps[0].All(item =>
                map.TryGetValue(item.Key, out var other)
                && item.Value.SlidePosition == other.SlidePosition
                && item.Value.ShapePosition == other.ShapePosition));

    private static bool SupportingPartsEqual(params string[] packagePaths)
    {
        var inventories = packagePaths.Select(PackageInventory).ToArray();
        return inventories.Skip(1).All(inventory =>
            inventories[0].Count == inventory.Count
            && inventories[0].All(item =>
                inventory.TryGetValue(item.Key, out var hash) && hash == item.Value));
    }

    private static bool UntouchedPartsEqual(
        string oursPath,
        string candidatePath,
        IReadOnlySet<string> mutableSlides)
    {
        var ours = FullPackageInventory(oursPath);
        var candidate = FullPackageInventory(candidatePath);
        return ours.Count == candidate.Count
            && ours.All(item =>
                candidate.TryGetValue(item.Key, out var hash)
                && (mutableSlides.Contains(item.Key) || hash == item.Value));
    }

    private static IReadOnlyDictionary<string, string> PackageInventory(string packagePath)
        => FullPackageInventory(packagePath)
            .Where(item => !IsSlideXml(item.Key))
            .ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);

    private static IReadOnlyDictionary<string, string> FullPackageInventory(string packagePath)
    {
        using var archive = ZipFile.OpenRead(packagePath);
        return archive.Entries
            .Where(entry => !entry.FullName.EndsWith("/", StringComparison.Ordinal))
            .ToDictionary(
                entry => entry.FullName,
                entry =>
                {
                    using var stream = entry.Open();
                    return Convert.ToHexStringLower(SHA256.HashData(stream));
                },
                StringComparer.Ordinal);
    }

    private static bool IsSlideXml(string part)
        => part.StartsWith("ppt/slides/slide", StringComparison.Ordinal)
            && part.EndsWith(".xml", StringComparison.Ordinal)
            && !part.Contains("/_rels/", StringComparison.Ordinal);

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

    private sealed record ShapeReference(
        int SlidePosition,
        int ShapePosition,
        SlidePart SlidePart,
        P.Shape Shape);
}

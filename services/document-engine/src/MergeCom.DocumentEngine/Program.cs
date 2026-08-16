using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MergeCom.DocumentEngine;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);
builder.Services
    .AddOptions<InspectionOptions>()
    .Bind(builder.Configuration.GetSection(InspectionOptions.SectionName))
    .Validate(options => options.InternalToken.Length >= 32, "Inspection internal token must be at least 32 characters.")
    .Validate(options => options.MaxInputBytes > 0, "Inspection input limit must be positive.")
    .Validate(options => options.MaxEntries > 0, "Inspection entry limit must be positive.")
    .Validate(options => options.MaxPartBytes > 0, "Inspection part limit must be positive.")
    .Validate(options => options.MaxExpandedBytes >= options.MaxPartBytes, "Inspection expansion limit must cover one maximum-size part.")
    .Validate(options => double.IsFinite(options.MaxCompressionRatio) && options.MaxCompressionRatio >= 1, "Inspection compression ratio must be finite and at least one.")
    .Validate(options => options.MaxXmlCharacters > 0, "Inspection XML character limit must be positive.")
    .Validate(options => options.MaxXmlDepth > 0, "Inspection XML depth limit must be positive.")
    .Validate(options => options.MaxValidationErrors > 0, "Inspection validation error limit must be positive.")
    .Validate(options => options.MaxSemanticItems > 0, "Inspection semantic item limit must be positive.")
    .Validate(options => options.MaxSemanticTextCharacters > 0, "Inspection semantic text limit must be positive.")
    .Validate(options => options.MaxComparisonInputBytes > 0, "Comparison input limit must be positive.")
    .Validate(options => options.MaxMergeInputBytes >= options.MaxInputBytes, "Merge input limit must cover one maximum-size package.")
    .Validate(options => !string.IsNullOrWhiteSpace(options.TempRoot), "Inspection temporary root is required.")
    .ValidateOnStart();
builder.Services.AddSingleton(serviceProvider =>
    new OoxmlInspector(serviceProvider.GetRequiredService<IOptions<InspectionOptions>>().Value));
builder.Services.AddSingleton<OoxmlComparator>();
builder.Services.AddSingleton(serviceProvider =>
    new OoxmlMerger(
        serviceProvider.GetRequiredService<IOptions<InspectionOptions>>().Value,
        serviceProvider.GetRequiredService<OoxmlComparator>()));
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
});
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 1;
});

var app = builder.Build();

app.MapGet("/health/live", () => Results.Ok(new
{
    service = "document-engine",
    status = "alive",
}));

app.MapGet("/health/ready", () => Results.Ok(new
{
    dependencies = new Dictionary<string, string>(),
    service = "document-engine",
    status = "ready",
}));

app.MapPost("/internal/v1/inspections", InspectAsync)
    .WithMetadata(new DisableRequestSizeLimitAttribute());

app.MapPost("/internal/v1/comparisons", CompareAsync)
    .WithMetadata(new DisableRequestSizeLimitAttribute());

app.MapPost("/internal/v1/merges", MergeAsync)
    .WithMetadata(new DisableRequestSizeLimitAttribute());

app.Run();

static async Task<IResult> InspectAsync(
    HttpRequest request,
    OoxmlInspector inspector,
    IOptions<InspectionOptions> configuredOptions,
    ILogger<Program> logger,
    CancellationToken cancellationToken)
{
    var options = configuredOptions.Value;
    if (!request.Headers.TryGetValue("X-MergeCom-Internal-Token", out var providedToken)
        || !TokensEqual(providedToken.ToString(), options.InternalToken))
    {
        return Results.Json(new { code = "unauthorized", message = "Internal authentication is required." }, statusCode: 401);
    }

    var fileType = request.Headers["X-MergeCom-File-Type"].ToString();
    var extension = request.Headers["X-MergeCom-Extension"].ToString().ToLowerInvariant();
    var expectedSha256 = request.Headers["X-MergeCom-Source-Sha256"].ToString();
    var traceId = request.Headers["X-MergeCom-Trace-Id"].ToString();
    if (!IsSupported(fileType, extension)
        || !IsSha256(expectedSha256)
        || !Guid.TryParse(traceId, out _))
    {
        return Results.BadRequest(new { code = "invalid_inspection_metadata", message = "Inspection metadata is invalid." });
    }

    if (request.ContentLength > options.MaxInputBytes)
    {
        return Results.Json(new { code = "input_too_large", message = "The Office package exceeds the inspection input limit." }, statusCode: 413);
    }

    Directory.CreateDirectory(options.TempRoot);
    var tempDirectory = Path.Combine(options.TempRoot, $"inspection-{Guid.NewGuid():N}");
    Directory.CreateDirectory(tempDirectory);
    var packagePath = Path.Combine(tempDirectory, $"source{extension}");
    try
    {
        var actualSha256 = await CopyBoundedAndHashAsync(
            request.Body,
            packagePath,
            options.MaxInputBytes,
            cancellationToken);
        if (!string.Equals(actualSha256, expectedSha256, StringComparison.Ordinal))
        {
            return Results.UnprocessableEntity(new { code = "source_hash_mismatch", message = "The source bytes do not match the declared SHA-256." });
        }

        using (logger.BeginScope(new Dictionary<string, object> { ["TraceId"] = traceId }))
        {
            var result = inspector.Inspect(packagePath, fileType, actualSha256);
            return Results.Ok(result);
        }
    }
    catch (InputLimitExceededException)
    {
        return Results.Json(new { code = "input_too_large", message = "The Office package exceeds the inspection input limit." }, statusCode: 413);
    }
    finally
    {
        try
        {
            Directory.Delete(tempDirectory, true);
        }
        catch (IOException exception)
        {
            logger.LogWarning(exception, "Could not remove inspection temporary directory {TempDirectory}.", tempDirectory);
        }
        catch (UnauthorizedAccessException exception)
        {
            logger.LogWarning(exception, "Could not remove inspection temporary directory {TempDirectory}.", tempDirectory);
        }
    }
}

static async Task<IResult> CompareAsync(
    HttpRequest request,
    OoxmlComparator comparator,
    IOptions<InspectionOptions> configuredOptions,
    ILogger<Program> logger,
    CancellationToken cancellationToken)
{
    var options = configuredOptions.Value;
    if (!request.Headers.TryGetValue("X-MergeCom-Internal-Token", out var providedToken)
        || !TokensEqual(providedToken.ToString(), options.InternalToken))
    {
        return Results.Json(new { code = "unauthorized", message = "Internal authentication is required." }, statusCode: 401);
    }

    var traceId = request.Headers["X-MergeCom-Trace-Id"].ToString();
    if (!Guid.TryParse(traceId, out _))
    {
        return Results.BadRequest(new { code = "invalid_comparison_metadata", message = "Comparison metadata is invalid." });
    }

    if (request.ContentLength > options.MaxComparisonInputBytes)
    {
        return Results.Json(new { code = "input_too_large", message = "The normalized snapshots exceed the comparison input limit." }, statusCode: 413);
    }

    try
    {
        var comparisonRequest = await ReadBoundedJsonAsync<SnapshotComparisonRequest>(
            request.Body,
            options.MaxComparisonInputBytes,
            cancellationToken);
        if (comparisonRequest?.BaseSnapshot is null || comparisonRequest.TargetSnapshot is null)
        {
            return Results.BadRequest(new { code = "invalid_comparison_input", message = "A base and target snapshot are required." });
        }

        using (logger.BeginScope(new Dictionary<string, object> { ["TraceId"] = traceId }))
        {
            return Results.Ok(comparator.Compare(
                comparisonRequest.BaseSnapshot,
                comparisonRequest.TargetSnapshot));
        }
    }
    catch (InputLimitExceededException)
    {
        return Results.Json(new { code = "input_too_large", message = "The normalized snapshots exceed the comparison input limit." }, statusCode: 413);
    }
    catch (JsonException)
    {
        return Results.BadRequest(new { code = "invalid_comparison_input", message = "The normalized snapshots are invalid." });
    }
    catch (InvalidComparisonException exception)
    {
        return Results.Json(new { code = exception.Code, message = exception.Message }, statusCode: 422);
    }
}

static async Task<IResult> MergeAsync(
    HttpRequest request,
    OoxmlMerger merger,
    IOptions<InspectionOptions> configuredOptions,
    ILogger<Program> logger,
    CancellationToken cancellationToken)
{
    var options = configuredOptions.Value;
    if (!request.Headers.TryGetValue("X-MergeCom-Internal-Token", out var providedToken)
        || !TokensEqual(providedToken.ToString(), options.InternalToken))
    {
        return Results.Json(new { code = "unauthorized", message = "Internal authentication is required." }, statusCode: 401);
    }

    var fileType = request.Headers["X-MergeCom-File-Type"].ToString();
    var extension = request.Headers["X-MergeCom-Extension"].ToString().ToLowerInvariant();
    var baseSha256 = request.Headers["X-MergeCom-Base-Sha256"].ToString();
    var oursSha256 = request.Headers["X-MergeCom-Ours-Sha256"].ToString();
    var theirsSha256 = request.Headers["X-MergeCom-Theirs-Sha256"].ToString();
    var traceId = request.Headers["X-MergeCom-Trace-Id"].ToString();
    var powerPointAutomaticMergeEnabled = string.Equals(
        request.Headers["X-MergeCom-PowerPoint-Automatic-Merge"].ToString(),
        "true",
        StringComparison.OrdinalIgnoreCase);
    var validBaseSize = long.TryParse(request.Headers["X-MergeCom-Base-Size"], out var baseSize);
    var validOursSize = long.TryParse(request.Headers["X-MergeCom-Ours-Size"], out var oursSize);
    var validTheirsSize = long.TryParse(request.Headers["X-MergeCom-Theirs-Size"], out var theirsSize);
    var validSizes = validBaseSize && validOursSize && validTheirsSize;
    long totalSize;
    try
    {
        totalSize = validSizes ? checked(baseSize + oursSize + theirsSize) : -1;
    }
    catch (OverflowException)
    {
        totalSize = -1;
    }

    if (!IsSupported(fileType, extension)
        || !IsSha256(baseSha256)
        || !IsSha256(oursSha256)
        || !IsSha256(theirsSha256)
        || !Guid.TryParse(traceId, out _)
        || baseSize <= 0
        || oursSize <= 0
        || theirsSize <= 0
        || baseSize > options.MaxInputBytes
        || oursSize > options.MaxInputBytes
        || theirsSize > options.MaxInputBytes
        || totalSize > options.MaxMergeInputBytes
        || request.ContentLength != totalSize)
    {
        return Results.BadRequest(new { code = "invalid_merge_metadata", message = "Merge metadata is invalid." });
    }

    Directory.CreateDirectory(options.TempRoot);
    var tempDirectory = Path.Combine(options.TempRoot, $"merge-{Guid.NewGuid():N}");
    Directory.CreateDirectory(tempDirectory);
    var basePath = Path.Combine(tempDirectory, $"base{extension}");
    var oursPath = Path.Combine(tempDirectory, $"ours{extension}");
    var theirsPath = Path.Combine(tempDirectory, $"theirs{extension}");
    var candidatePath = Path.Combine(tempDirectory, $"candidate{extension}");
    try
    {
        var actualBaseSha256 = await CopyExactAndHashAsync(
            request.Body, basePath, baseSize, cancellationToken);
        var actualOursSha256 = await CopyExactAndHashAsync(
            request.Body, oursPath, oursSize, cancellationToken);
        var actualTheirsSha256 = await CopyExactAndHashAsync(
            request.Body, theirsPath, theirsSize, cancellationToken);
        if (actualBaseSha256 != baseSha256
            || actualOursSha256 != oursSha256
            || actualTheirsSha256 != theirsSha256)
        {
            return Results.UnprocessableEntity(new { code = "source_hash_mismatch", message = "A merge source does not match its declared SHA-256." });
        }

        using (logger.BeginScope(new Dictionary<string, object> { ["TraceId"] = traceId }))
        {
            return Results.Ok(merger.Merge(
                basePath,
                oursPath,
                theirsPath,
                fileType,
                baseSha256,
                oursSha256,
                theirsSha256,
                candidatePath,
                powerPointAutomaticMergeEnabled));
        }
    }
    catch (EndOfStreamException)
    {
        return Results.BadRequest(new { code = "merge_body_incomplete", message = "The merge request body is incomplete." });
    }
    finally
    {
        try
        {
            Directory.Delete(tempDirectory, true);
        }
        catch (IOException exception)
        {
            logger.LogWarning(exception, "Could not remove merge temporary directory {TempDirectory}.", tempDirectory);
        }
        catch (UnauthorizedAccessException exception)
        {
            logger.LogWarning(exception, "Could not remove merge temporary directory {TempDirectory}.", tempDirectory);
        }
    }
}

static async Task<string> CopyBoundedAndHashAsync(
    Stream source,
    string destinationPath,
    long limit,
    CancellationToken cancellationToken)
{
    using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    await using var destination = new FileStream(
        destinationPath,
        FileMode.CreateNew,
        FileAccess.Write,
        FileShare.None,
        64 * 1024,
        FileOptions.Asynchronous | FileOptions.SequentialScan);
    var buffer = new byte[64 * 1024];
    long total = 0;
    int read;
    while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
    {
        total = checked(total + read);
        if (total > limit)
        {
            throw new InputLimitExceededException();
        }

        hash.AppendData(buffer, 0, read);
        await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
    }

    await destination.FlushAsync(cancellationToken);
    return Convert.ToHexStringLower(hash.GetHashAndReset());
}

static async Task<string> CopyExactAndHashAsync(
    Stream source,
    string destinationPath,
    long expectedBytes,
    CancellationToken cancellationToken)
{
    using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    await using var destination = new FileStream(
        destinationPath,
        FileMode.CreateNew,
        FileAccess.Write,
        FileShare.None,
        64 * 1024,
        FileOptions.Asynchronous | FileOptions.SequentialScan);
    var buffer = new byte[64 * 1024];
    long remaining = expectedBytes;
    while (remaining > 0)
    {
        var read = await source.ReadAsync(
            buffer.AsMemory(0, (int)Math.Min(buffer.Length, remaining)),
            cancellationToken);
        if (read == 0)
        {
            throw new EndOfStreamException();
        }

        hash.AppendData(buffer, 0, read);
        await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        remaining -= read;
    }

    await destination.FlushAsync(cancellationToken);
    return Convert.ToHexStringLower(hash.GetHashAndReset());
}

static async Task<T?> ReadBoundedJsonAsync<T>(
    Stream source,
    long limit,
    CancellationToken cancellationToken)
{
    using var destination = new MemoryStream();
    var buffer = new byte[64 * 1024];
    long total = 0;
    int read;
    while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
    {
        total = checked(total + read);
        if (total > limit)
        {
            throw new InputLimitExceededException();
        }

        await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
    }

    destination.Position = 0;
    return await JsonSerializer.DeserializeAsync<T>(
        destination,
        new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        },
        cancellationToken);
}

static bool TokensEqual(string provided, string expected)
{
    var providedHash = SHA256.HashData(Encoding.UTF8.GetBytes(provided));
    var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
    return CryptographicOperations.FixedTimeEquals(providedHash, expectedHash);
}

static bool IsSha256(string value) => value.Length == 64
    && value.All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f');

static bool IsSupported(string fileType, string extension) => (fileType, extension) switch
{
    ("presentation", ".pptx" or ".pptm") => true,
    ("spreadsheet", ".xlsx" or ".xlsm") => true,
    ("word_document", ".docx" or ".docm") => true,
    _ => false,
};

public partial class Program;

internal sealed class InputLimitExceededException : Exception;

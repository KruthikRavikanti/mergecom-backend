var builder = WebApplication.CreateBuilder(args);
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

app.Run();

public partial class Program;

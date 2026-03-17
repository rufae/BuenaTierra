# ============================================================
# Dockerfile multi-stage para BuenaTierra.API
# ============================================================

# Etapa 1: Build
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copiar archivos de proyecto primero para aprovechar cache de Docker
COPY ["src/BuenaTierra.API/BuenaTierra.API.csproj", "src/BuenaTierra.API/"]
COPY ["src/BuenaTierra.Application/BuenaTierra.Application.csproj", "src/BuenaTierra.Application/"]
COPY ["src/BuenaTierra.Domain/BuenaTierra.Domain.csproj", "src/BuenaTierra.Domain/"]
COPY ["src/BuenaTierra.Infrastructure/BuenaTierra.Infrastructure.csproj", "src/BuenaTierra.Infrastructure/"]

RUN dotnet restore "src/BuenaTierra.API/BuenaTierra.API.csproj"

# Copiar resto del código fuente
COPY . .

WORKDIR "/src/src/BuenaTierra.API"
RUN dotnet build "BuenaTierra.API.csproj" -c Release -o /app/build

# Etapa 2: Publish
FROM build AS publish
RUN dotnet publish "BuenaTierra.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Etapa 3: Runtime final (imagen mínima)
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

WORKDIR /app

# Crear directorios necesarios
RUN mkdir -p logs reports uploads/logos && chown -R appuser:appgroup /app

COPY --from=publish --chown=appuser:appgroup /app/publish .

USER appuser

EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "BuenaTierra.API.dll"]

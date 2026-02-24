using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace BuenaTierra.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // DbSets
    public DbSet<Empresa> Empresas => Set<Empresa>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<ClienteCondicionEspecial> ClienteCondicionesEspeciales => Set<ClienteCondicionEspecial>();
    public DbSet<Categoria> Categorias => Set<Categoria>();
    public DbSet<Alergeno> Alergenos => Set<Alergeno>();
    public DbSet<Ingrediente> Ingredientes => Set<Ingrediente>();
    public DbSet<IngredienteAlergeno> IngredienteAlergenos => Set<IngredienteAlergeno>();
    public DbSet<Producto> Productos => Set<Producto>();
    public DbSet<ProductoIngrediente> ProductoIngredientes => Set<ProductoIngrediente>();
    public DbSet<Produccion> Producciones => Set<Produccion>();
    public DbSet<Lote> Lotes => Set<Lote>();
    public DbSet<Stock> Stocks => Set<Stock>();
    public DbSet<MovimientoStock> MovimientosStock => Set<MovimientoStock>();
    public DbSet<SerieFacturacion> SeriesFacturacion => Set<SerieFacturacion>();
    public DbSet<Pedido> Pedidos => Set<Pedido>();
    public DbSet<PedidoLinea> PedidosLineas => Set<PedidoLinea>();
    public DbSet<Albaran> Albaranes => Set<Albaran>();
    public DbSet<AlbaranLinea> AlbaranesLineas => Set<AlbaranLinea>();
    public DbSet<Factura> Facturas => Set<Factura>();
    public DbSet<FacturaLinea> FacturasLineas => Set<FacturaLinea>();
    public DbSet<Trazabilidad> Trazabilidades => Set<Trazabilidad>();
    public DbSet<ControlMateriaPrima> ControlMatPrimas => Set<ControlMateriaPrima>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        base.OnModelCreating(mb);

        // Configurar nombre de tablas en snake_case PostgreSQL
        mb.Entity<Empresa>().ToTable("empresas");
        mb.Entity<Usuario>().ToTable("usuarios");
        mb.Entity<Cliente>().ToTable("clientes");
        mb.Entity<ClienteCondicionEspecial>().ToTable("cliente_condiciones_especiales");
        mb.Entity<Categoria>().ToTable("categorias");
        mb.Entity<Alergeno>().ToTable("alergenos");
        mb.Entity<Ingrediente>().ToTable("ingredientes");
        mb.Entity<IngredienteAlergeno>().ToTable("ingrediente_alergenos");
        mb.Entity<Producto>().ToTable("productos");
        mb.Entity<ProductoIngrediente>().ToTable("producto_ingredientes");
        mb.Entity<Produccion>().ToTable("producciones");
        mb.Entity<Lote>().ToTable("lotes");
        mb.Entity<Stock>().ToTable("stock");
        mb.Entity<MovimientoStock>().ToTable("movimientos_stock");
        mb.Entity<SerieFacturacion>().ToTable("series_facturacion");
        mb.Entity<Pedido>().ToTable("pedidos");
        mb.Entity<PedidoLinea>().ToTable("pedidos_lineas");
        mb.Entity<Albaran>().ToTable("albaranes");
        mb.Entity<AlbaranLinea>().ToTable("albaranes_lineas");
        mb.Entity<Factura>().ToTable("facturas");
        mb.Entity<FacturaLinea>().ToTable("facturas_lineas");
        mb.Entity<ControlMateriaPrima>().ToTable("control_materias_primas");

        mb.Entity<Trazabilidad>(e =>
        {
            e.ToTable("trazabilidad");
            e.Property(x => x.DatosAdicionales).HasColumnType("jsonb").HasDefaultValue("{}");
        });

        // ---- EMPRESA ----
        mb.Entity<Empresa>(e =>
        {
            e.Property(x => x.Nombre).HasMaxLength(200).IsRequired();
            e.Property(x => x.Nif).HasMaxLength(20).IsRequired();
            e.HasIndex(x => x.Nif).IsUnique();
            e.Property(x => x.Configuracion).HasColumnType("jsonb").HasDefaultValue("{}");
            e.HasOne(x => x.EmpresaPadre).WithMany(x => x.SubEmpresas).HasForeignKey(x => x.EmpresaPadreId);
        });

        // ---- USUARIO ----
        mb.Entity<Usuario>(e =>
        {
            e.Property(x => x.Email).HasMaxLength(200).IsRequired();
            e.HasIndex(x => new { x.EmpresaId, x.Email }).IsUnique();
            e.Property(x => x.Rol).HasConversion(new EnumToStringConverter<RolUsuario>()).HasMaxLength(20);
            e.HasOne(x => x.Empresa).WithMany(x => x.Usuarios).HasForeignKey(x => x.EmpresaId);
        });

        // ---- CLIENTE ----
        mb.Entity<Cliente>(e =>
        {
            // Identificación
            e.Property(x => x.Tipo).HasConversion(new EnumToStringConverter<TipoCliente>()).HasMaxLength(20);
            e.Property(x => x.CodigoClienteInterno).HasMaxLength(50);
            e.Property(x => x.Nombre).HasMaxLength(200).IsRequired();
            e.Property(x => x.Apellidos).HasMaxLength(200);
            e.Property(x => x.RazonSocial).HasMaxLength(300);
            e.Property(x => x.NombreComercial).HasMaxLength(300);
            e.Property(x => x.NombreFiscal).HasMaxLength(300);
            e.Property(x => x.Nif).HasMaxLength(20);
            e.Property(x => x.AliasCliente).HasMaxLength(100);
            // Domicilio
            e.Property(x => x.Direccion).HasMaxLength(300);
            e.Property(x => x.CodigoPostal).HasMaxLength(10);
            e.Property(x => x.Ciudad).HasMaxLength(150);
            e.Property(x => x.Provincia).HasMaxLength(100);
            e.Property(x => x.Pais).HasMaxLength(100);
            // Contacto
            e.Property(x => x.Telefono).HasMaxLength(30);
            e.Property(x => x.Telefono2).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.PersonaContacto).HasMaxLength(200);
            e.Property(x => x.ObservacionesContacto).HasMaxLength(500);
            // Datos Bancarios
            e.Property(x => x.Ccc).HasMaxLength(30);
            e.Property(x => x.Iban).HasMaxLength(34);
            e.Property(x => x.Banco).HasMaxLength(150);
            e.Property(x => x.Bic).HasMaxLength(11);
            // Comercial
            e.Property(x => x.FormaPago).HasConversion(new EnumToStringConverter<FormaPago>()).HasMaxLength(30);
            e.Property(x => x.TipoImpuesto).HasConversion(new EnumToStringConverter<TipoImpuesto>()).HasMaxLength(30);
            e.Property(x => x.PorcentajeRetencion).HasPrecision(5, 2);
            e.Property(x => x.DescuentoGeneral).HasPrecision(5, 2);
            // Otros Datos
            e.Property(x => x.EstadoCliente).HasConversion(new EnumToStringConverter<EstadoCliente>()).HasMaxLength(20);
            e.Property(x => x.EstadoSincronizacion).HasConversion(new EnumToStringConverter<EstadoSincronizacion>()).HasMaxLength(30);
            e.Property(x => x.Notas).HasMaxLength(2000);
            // FK
            e.HasOne(x => x.Empresa).WithMany(x => x.Clientes).HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.RepartidorEmpresa).WithMany().HasForeignKey(x => x.RepartidorEmpresaId);
            e.HasMany(x => x.CondicionesEspeciales).WithOne(x => x.Cliente).HasForeignKey(x => x.ClienteId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- CLIENTE CONDICION ESPECIAL ----
        mb.Entity<ClienteCondicionEspecial>(e =>
        {
            e.Property(x => x.ArticuloFamilia).HasConversion(new EnumToStringConverter<TipoArticuloFamilia>()).HasMaxLength(20);
            e.Property(x => x.Codigo).HasMaxLength(100).IsRequired();
            e.Property(x => x.Descripcion).HasMaxLength(300);
            e.Property(x => x.Tipo).HasConversion(new EnumToStringConverter<TipoCondicionEspecial>()).HasMaxLength(30);
            e.Property(x => x.Precio).HasPrecision(10, 2);
            e.Property(x => x.Descuento).HasPrecision(5, 2);
        });

        // ---- CONTROL MATERIAS PRIMAS ----
        mb.Entity<ControlMateriaPrima>(e =>
        {
            e.Property(x => x.Producto).HasMaxLength(300).IsRequired();
            e.Property(x => x.Unidades).HasPrecision(10, 3);
            e.Property(x => x.Proveedor).HasMaxLength(200);
            e.Property(x => x.Lote).HasMaxLength(100);
            e.Property(x => x.Responsable).HasMaxLength(200);
            e.Property(x => x.Observaciones).HasMaxLength(1000);
            e.HasOne(x => x.Empresa).WithMany().HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.Ingrediente).WithMany().HasForeignKey(x => x.IngredienteId)
                .IsRequired(false).OnDelete(DeleteBehavior.SetNull);
        });

        // ---- PRODUCTO ----
        mb.Entity<Producto>(e =>
        {
            e.Property(x => x.PrecioVenta).HasPrecision(10, 4).IsRequired();
            e.Property(x => x.PrecioCoste).HasPrecision(10, 4);
            e.Property(x => x.IvaPorcentaje).HasPrecision(5, 2);
            e.Property(x => x.DescuentoPorDefecto).HasPrecision(5, 2);
            e.Property(x => x.StockMinimo).HasPrecision(10, 3);
            e.Property(x => x.StockMaximo).HasPrecision(10, 3);
            e.Property(x => x.CodigoBarras).HasMaxLength(100);
            e.Property(x => x.ProveedorHabitual).HasMaxLength(200);
            e.Property(x => x.Referencia).HasMaxLength(100);
            e.Property(x => x.Fabricante).HasMaxLength(200);
            e.HasIndex(x => new { x.EmpresaId, x.Codigo }).IsUnique();
            e.HasOne(x => x.Empresa).WithMany(x => x.Productos).HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.Categoria).WithMany(x => x.Productos).HasForeignKey(x => x.CategoriaId);
        });

        // ---- INGREDIENTE_ALERGENO (PK compuesta) ----
        mb.Entity<Categoria>(e =>
        {
            e.HasOne(x => x.CategoriaPadre).WithMany(x => x.Subcategorias)
                .HasForeignKey(x => x.PadreId).HasConstraintName("categorias_padre_id_fkey");
            e.HasOne(x => x.Empresa).WithMany().HasForeignKey(x => x.EmpresaId);
        });

        mb.Entity<IngredienteAlergeno>(e =>
        {
            e.HasKey(x => new { x.IngredienteId, x.AlergenoId });
            e.HasOne(x => x.Ingrediente).WithMany(x => x.IngredienteAlergenos).HasForeignKey(x => x.IngredienteId);
            e.HasOne(x => x.Alergeno).WithMany().HasForeignKey(x => x.AlergenoId);
        });

        // ---- PRODUCTO_INGREDIENTE ----
        mb.Entity<ProductoIngrediente>(e =>
        {
            e.HasIndex(x => new { x.ProductoId, x.IngredienteId }).IsUnique();
            e.Property(x => x.CantidadGr).HasPrecision(10, 3);
        });

        // ---- PRODUCCION ----
        mb.Entity<Produccion>(e =>
        {
            e.Property(x => x.Estado).HasConversion(new EnumToStringConverter<EstadoProduccion>()).HasMaxLength(20);
            e.Property(x => x.CantidadProducida).HasPrecision(10, 3).IsRequired();
            e.Property(x => x.CantidadMerma).HasPrecision(10, 3);
        });

        // ---- LOTE ----
        mb.Entity<Lote>(e =>
        {
            e.Property(x => x.CodigoLote).HasMaxLength(50).IsRequired();
            e.HasIndex(x => new { x.EmpresaId, x.CodigoLote }).IsUnique();
            e.Property(x => x.CantidadInicial).HasPrecision(10, 3).IsRequired();
            e.HasOne(x => x.Empresa).WithMany(x => x.Lotes).HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.Producto).WithMany(x => x.Lotes).HasForeignKey(x => x.ProductoId);
            e.HasOne(x => x.Produccion).WithMany(x => x.Lotes).HasForeignKey(x => x.ProduccionId);
        });

        // ---- STOCK ----
        mb.Entity<Stock>(e =>
        {
            e.HasIndex(x => new { x.EmpresaId, x.ProductoId, x.LoteId }).IsUnique();
            e.Property(x => x.CantidadDisponible).HasPrecision(10, 3);
            e.Property(x => x.CantidadReservada).HasPrecision(10, 3);
            e.HasCheckConstraint("stock_disponible_positivo", "cantidad_disponible >= 0");
            e.HasCheckConstraint("stock_reservada_positivo", "cantidad_reservada >= 0");
            e.HasOne(x => x.Lote).WithOne(x => x.Stock).HasForeignKey<Stock>(x => x.LoteId);
            e.HasOne(x => x.Producto).WithMany(x => x.Stocks).HasForeignKey(x => x.ProductoId);
        });

        // ---- MOVIMIENTO STOCK ----
        mb.Entity<MovimientoStock>(e =>
        {
            e.Property(x => x.Tipo).HasConversion(new EnumToStringConverter<TipoMovimientoStock>()).HasMaxLength(30);
            e.Property(x => x.Cantidad).HasPrecision(10, 3);
            e.Property(x => x.CantidadAntes).HasPrecision(10, 3);
            e.Property(x => x.CantidadDespues).HasPrecision(10, 3);
        });

        // ---- FACTURA ----
        mb.Entity<Factura>(e =>
        {
            e.Property(x => x.NumeroFactura).HasMaxLength(50).IsRequired();
            e.HasIndex(x => new { x.EmpresaId, x.NumeroFactura }).IsUnique();
            e.Property(x => x.Estado).HasConversion(new EnumToStringConverter<EstadoFactura>()).HasMaxLength(20);
            e.Property(x => x.Subtotal).HasPrecision(12, 4);
            e.Property(x => x.DescuentoTotal).HasPrecision(12, 4);
            e.Property(x => x.BaseImponible).HasPrecision(12, 4);
            e.Property(x => x.IvaTotal).HasPrecision(12, 4);
            e.Property(x => x.RecargoEquivalenciaTotal).HasPrecision(12, 4);
            e.Property(x => x.RetencionTotal).HasPrecision(12, 4);
            e.Property(x => x.Total).HasPrecision(12, 4);
            e.Property(x => x.IvaDesglose).HasColumnType("jsonb").HasDefaultValue("[]");
            e.HasOne(x => x.Empresa).WithMany(x => x.Facturas).HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.Cliente).WithMany(x => x.Facturas).HasForeignKey(x => x.ClienteId);
        });

        // ---- FACTURA LINEA ----
        mb.Entity<FacturaLinea>(e =>
        {
            e.Property(x => x.Cantidad).HasPrecision(10, 3).IsRequired();
            e.Property(x => x.PrecioUnitario).HasPrecision(10, 4).IsRequired();
            e.Property(x => x.Descuento).HasPrecision(5, 2);
            e.Property(x => x.IvaPorcentaje).HasPrecision(5, 2);
            e.Property(x => x.RecargoEquivalenciaPorcentaje).HasPrecision(5, 2);
            // Las columnas calculadas en C# no se mapean como generadas en EF (se computan en BD via SQL)
            e.Ignore(x => x.Subtotal);
            e.Ignore(x => x.IvaImporte);
            e.Ignore(x => x.RecargoEquivalenciaImporte);
            e.Ignore(x => x.Total);
        });

        // ---- PEDIDO ----
        mb.Entity<Pedido>(e =>
        {
            e.Property(x => x.Estado).HasConversion(new EnumToStringConverter<EstadoPedido>()).HasMaxLength(20);
            e.Property(x => x.Subtotal).HasPrecision(12, 4);
            e.Property(x => x.Total).HasPrecision(12, 4);
            e.HasOne(x => x.Empresa).WithMany().HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.Cliente).WithMany(x => x.Pedidos).HasForeignKey(x => x.ClienteId);
        });

        // ---- PEDIDO LINEA ----
        mb.Entity<PedidoLinea>(e =>
        {
            e.Ignore(x => x.Subtotal);
            e.Ignore(x => x.IvaImporte);
            e.Ignore(x => x.RecargoEquivalenciaImporte);
            e.Property(x => x.PrecioUnitario).HasPrecision(10, 4);
            e.Property(x => x.Descuento).HasPrecision(5, 2);
            e.Property(x => x.IvaPorcentaje).HasPrecision(5, 2);
            e.Property(x => x.RecargoEquivalenciaPorcentaje).HasPrecision(5, 2);
        });

        // ---- ALBARAN ----
        mb.Entity<Albaran>(e =>
        {
            e.Property(x => x.Estado).HasConversion(new EnumToStringConverter<EstadoAlbaran>()).HasMaxLength(20);
            e.Property(x => x.Subtotal).HasPrecision(12, 4);
            e.Property(x => x.IvaTotal).HasPrecision(12, 4);
            e.Property(x => x.RecargoEquivalenciaTotal).HasPrecision(12, 4);
            e.Property(x => x.RetencionTotal).HasPrecision(12, 4);
            e.Property(x => x.Total).HasPrecision(12, 4);
            e.HasOne(x => x.Empresa).WithMany().HasForeignKey(x => x.EmpresaId);
            e.HasOne(x => x.Cliente).WithMany(x => x.Albaranes).HasForeignKey(x => x.ClienteId);
        });

        // ---- ALBARAN LINEA ----
        mb.Entity<AlbaranLinea>(e =>
        {
            e.Ignore(x => x.Subtotal);
            e.Ignore(x => x.IvaImporte);
            e.Property(x => x.RecargoEquivalenciaPorcentaje).HasPrecision(5, 2);
            e.Ignore(x => x.RecargoEquivalenciaImporte);
        });

        // columnas en snake_case automático para EF Core
        foreach (var entity in mb.Model.GetEntityTypes())
        {
            entity.SetTableName(entity.GetTableName());
            foreach (var prop in entity.GetProperties())
                prop.SetColumnName(ToSnakeCase(prop.GetColumnName()));
            foreach (var key in entity.GetKeys())
                key.SetName(ToSnakeCase(key.GetName()!));
            foreach (var fk in entity.GetForeignKeys())
                fk.SetConstraintName(ToSnakeCase(fk.GetConstraintName()!));
            foreach (var idx in entity.GetIndexes())
                idx.SetDatabaseName(ToSnakeCase(idx.GetDatabaseName()!));
        }
    }

    private static string ToSnakeCase(string name)
    {
        return string.Concat(name.Select((c, i) =>
            i > 0 && char.IsUpper(c) ? "_" + char.ToLower(c) : char.ToLower(c).ToString()));
    }
}

-- ============================================================
-- BuenaTierra - Upgrade 06 (2026-04-07)
-- Módulo de correo integrado
-- ============================================================

CREATE TABLE IF NOT EXISTS correos_mensajes (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    factura_id      INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
    folder          VARCHAR(20) NOT NULL DEFAULT 'Sent' CHECK (folder IN ('Inbox','Sent','Drafts','Errors')),
    estado          TEXT NOT NULL DEFAULT 'Enviado' CHECK (estado IN ('Borrador','Enviado','Error')),
    para            VARCHAR(1000) NOT NULL,
    cc              VARCHAR(1000),
    cco             VARCHAR(1000),
    asunto          VARCHAR(300) NOT NULL,
    cuerpo          TEXT NOT NULL,
    adjunto_nombre  VARCHAR(300),
    error           VARCHAR(2000),
    fecha_envio     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correos_empresa_folder_created
    ON correos_mensajes(empresa_id, folder, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_correos_mensajes ON correos_mensajes;
CREATE TRIGGER trg_updated_at_correos_mensajes
BEFORE UPDATE ON correos_mensajes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_version(version, descripcion)
VALUES (3, 'Módulo de correo integrado (correos_mensajes)')
ON CONFLICT (version) DO NOTHING;

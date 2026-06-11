// /api/create-dns.js
// Vercel Serverless Function — Node.js
// Dependencias: npm install resend
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Configura estos valores con los tuyos ──────────────────────────────────
const CF_ZONE_ID    = process.env.CLOUDFLARE_ZONE_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const BASE_DOMAIN   = 'tecnosofia.xyz';
const FROM_EMAIL    = 'hola@tecnosofia.xyz';       // Debe coincidir con el dominio verificado en Resend
// ──────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    // Solo aceptar POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Método no permitido.' });
    }

    const { subdomain, target, email } = req.body ?? {};

    // ── Validaciones básicas ───────────────────────────────────────────────
    if (!subdomain || !target) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos.' });
    }

    // Solo letras, números y guiones; entre 3 y 30 chars
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(subdomain)) {
        return res.status(400).json({ success: false, error: 'Nombre de subdominio inválido.' });
    }

    // El target debe terminar en .vercel.app
    if (!target.endsWith('.vercel.app')) {
        return res.status(400).json({ success: false, error: 'El enlace debe terminar en .vercel.app' });
    }

    const fullDomain = `${subdomain}.${BASE_DOMAIN}`;

    try {
        // ── 1. Crear el registro CNAME en Cloudflare ──────────────────────
        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CF_API_TOKEN}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify({
                    type:    'CNAME',
                    name:    subdomain,       // Cloudflare agrega el dominio raíz automáticamente
                    content: target,
                    ttl:     1,              // 1 = automático en Cloudflare
                    proxied: false,          // false para que Vercel pueda verificar el dominio
                }),
            }
        );

        const cfData = await cfResponse.json();

        if (!cfData.success) {
            // Cloudflare devuelve códigos de error: 81053 = registro duplicado
            const isDuplicate = cfData.errors?.some(e => e.code === 81053);
            const errorMsg    = isDuplicate
                ? 'Ese nombre ya está en uso. Elige otro.'
                : `Error de Cloudflare: ${cfData.errors?.[0]?.message ?? 'desconocido'}`;
            return res.status(400).json({ success: false, error: errorMsg });
        }

        // ── 2. Enviar correo de confirmación (solo si el usuario dio su email) ──
        if (email && isValidEmail(email)) {
            await enviarCorreoConfirmacion({ email, subdomain, fullDomain, target });
        }

        return res.status(200).json({ success: true, domain: fullDomain });

    } catch (err) {
        console.error('Error en create-dns:', err);
        return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
}

// ── Envío de correo ────────────────────────────────────────────────────────
async function enviarCorreoConfirmacion({ email, subdomain, fullDomain, target }) {
    try {
        await resend.emails.send({
            from:    FROM_EMAIL,
            to:      email,
            subject: `✅ Tu enlace ${fullDomain} ya está listo`,
            html: plantillaCorreo({ subdomain, fullDomain, target }),
        });
    } catch (emailErr) {
        // El error de correo no debe romper el flujo principal
        console.error('Error al enviar correo:', emailErr);
    }
}

// ── Plantilla HTML del correo ──────────────────────────────────────────────
function plantillaCorreo({ subdomain, fullDomain, target }) {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu enlace en Tecnosofia</title>
</head>
<body style="margin:0;padding:0;background:#080e1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0f1c2e;border-radius:14px;border:1px solid #1e3a5f;overflow:hidden;max-width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Tecnosofia</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Tu espacio gratis en internet 🚀</p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px;color:#f0f6ff;font-size:20px;">¡Felicidades! Tu enlace está listo 🎉</h2>
              <p style="margin:0 0 24px;color:#8baec4;font-size:15px;line-height:1.6;">
                Registramos exitosamente tu subdominio en Tecnosofia. Guarda bien esta información.
              </p>

              <!-- Dominio destacado -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#080e1a;border:1px solid #4ade80;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 4px;color:#8baec4;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Tu enlace oficial</p>
                    <p style="margin:0;color:#4ade80;font-size:20px;font-weight:800;word-break:break-all;">${fullDomain}</p>
                  </td>
                </tr>
              </table>

              <!-- Alerta último paso -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,158,11,0.07);border-left:3px solid #f59e0b;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;color:#f0f6ff;font-size:15px;font-weight:700;">⚠️ Debes hacer un paso más en Vercel</p>
                    <p style="margin:0;color:#8baec4;font-size:14px;line-height:1.6;">
                      Sin este paso, tu página mostrará <strong style="color:#f87171;">Error 404</strong>. Sigue las instrucciones de abajo.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Pasos -->
              <h3 style="margin:0 0 16px;color:#f0f6ff;font-size:16px;">Cómo configurar Vercel:</h3>

              <table width="100%" cellpadding="0" cellspacing="0">
                ${[
                    ['1', 'Abre tu panel de <strong style="color:#f0f6ff;">Vercel</strong> y entra a tu proyecto.'],
                    ['2', 'En el menú izquierdo haz clic en <strong style="color:#f0f6ff;">Domains</strong>.'],
                    ['3', `Haz clic en <strong style="color:#f0f6ff;">Add</strong> y pega exactamente:<br><code style="background:#080e1a;color:#38bdf8;padding:3px 8px;border-radius:5px;border:1px solid #1e3a5f;font-size:15px;">${fullDomain}</code>`],
                    ['4', 'Si Vercel pregunta por redirecciones, elige añadir <strong style="color:#f0f6ff;">únicamente tu subdominio exacto</strong>. ¡Aparecerán palomitas azules y habrás terminado! ✅'],
                ].map(([n, texto]) => `
                <tr>
                  <td style="padding:0 0 16px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;">
                          <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px;">${n}</div>
                        </td>
                        <td style="color:#8baec4;font-size:14px;line-height:1.6;">${texto}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join('')}
              </table>

              <!-- Datos del registro -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#080e1a;border:1px solid #1e3a5f;border-radius:10px;margin-top:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;color:#8baec4;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Datos de tu registro</p>
                    <p style="margin:0 0 6px;color:#8baec4;font-size:13px;">Subdominio: <span style="color:#38bdf8;">${fullDomain}</span></p>
                    <p style="margin:0;color:#8baec4;font-size:13px;">Apunta a: <span style="color:#38bdf8;">${target}</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #1e3a5f;text-align:center;">
              <p style="margin:0;color:#8baec4;font-size:12px;line-height:1.6;">
                Este correo fue enviado porque alguien registró <strong>${fullDomain}</strong> en Tecnosofia.<br>
                Si no fuiste tú, ignora este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
}

// ── Utilidad ───────────────────────────────────────────────────────────────
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

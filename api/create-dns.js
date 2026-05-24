export default async function handler(req, res) {
    // Solo permitir peticiones de envío de datos (POST)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { subdomain, target } = req.body;

    // Validaciones básicas de seguridad
    if (!subdomain || !target) {
        return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    // Traer tus llaves secretas guardadas de forma segura en Vercel
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

    try {
        const cloudflareResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'CNAME',
                name: subdomain,
                content: target,
                ttl: 1,
                proxied: false
            })
        });

        const data = await cloudflareResponse.json();

        if (data.success) {
            return res.status(200).json({ success: true });
        } else {
            // Si Cloudflare rechaza el nombre (porque ya existe, por ejemplo)
            const errMsg = data.errors?.[0]?.message || 'Error en Cloudflare';
            return res.status(400).json({ success: false, error: errMsg });
        }

    } catch (error) {
        return res.status(500).json({ success: false, error: 'Fallo interno en el servidor virtual.' });
    }
}

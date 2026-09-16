const TAG = '[EmbedPanel]';

/**
 * Embeds an external web page below the device list. The URL is served by
 * the backend from the EMBED_URL environment variable (see `/config.json`),
 * so it can be changed on container start or from docker-compose without
 * rebuilding the image.
 */
export default class EmbedPanel {
    public static async init(): Promise<void> {
        let embedUrl = '';
        try {
            const response = await fetch(`${location.pathname}config.json`, { cache: 'no-store' });
            if (!response.ok) {
                return;
            }
            const config = await response.json();
            if (config && typeof config.embedUrl === 'string') {
                embedUrl = config.embedUrl.trim();
            }
        } catch (error: any) {
            console.warn(TAG, 'Failed to load runtime config:', error.message);
            return;
        }
        if (!embedUrl) {
            return;
        }
        const panel = document.createElement('div');
        panel.className = 'embed-panel';
        const frame = document.createElement('iframe');
        frame.className = 'embed-frame';
        frame.src = embedUrl;
        frame.title = 'Embedded page';
        frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-read; clipboard-write');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        panel.appendChild(frame);
        document.body.appendChild(panel);
        document.body.classList.add('has-embed');
        // Device list clients replace the body class name; keep our marker.
        const observer = new MutationObserver(() => {
            if (!document.body.classList.contains('has-embed')) {
                document.body.classList.add('has-embed');
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
}

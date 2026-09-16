import VideoSettings from '../VideoSettings';
import Size from '../Size';
import Rect from '../Rect';

export interface StoredStreamSettings {
    videoSettings: VideoSettings;
    fitToScreen: boolean;
}

const STORAGE_KEY = 'ws-scrcpy::stream::default-settings';
const PLAYER_KEY = 'ws-scrcpy::stream::default-player';
const BROWSER_ORIENTATION_KEY = 'ws-scrcpy::stream::browser-orientation';

/**
 * Persistent default stream settings (bitrate, fps, i-frame interval,
 * resolution, encoder). Saved when the user applies settings in the
 * settings panel and used as the default on the next connection.
 */
export default class StreamSettingsStorage {
    public static loadPlayer(): string | undefined {
        if (!window.localStorage) {
            return;
        }
        const player = window.localStorage.getItem(PLAYER_KEY);
        return player || undefined;
    }

    public static savePlayer(playerName: string): void {
        if (!window.localStorage) {
            return;
        }
        try {
            window.localStorage.setItem(PLAYER_KEY, playerName);
        } catch (error: any) {
            console.error('[StreamSettingsStorage]', 'Failed to save player', error.message);
        }
    }

    public static loadBrowserOrientation(): number | undefined {
        if (!window.localStorage) {
            return;
        }
        const raw = window.localStorage.getItem(BROWSER_ORIENTATION_KEY);
        if (raw === '0') {
            return 0;
        }
        if (raw === '90') {
            return 90;
        }
        return;
    }

    public static saveBrowserOrientation(value: number): void {
        if (!window.localStorage) {
            return;
        }
        if (value !== 0 && value !== 90) {
            return;
        }
        try {
            window.localStorage.setItem(BROWSER_ORIENTATION_KEY, value.toString());
        } catch (error: any) {
            console.error('[StreamSettingsStorage]', 'Failed to save browser orientation', error.message);
        }
    }

    public static load(): StoredStreamSettings | undefined {
        if (!window.localStorage) {
            return;
        }
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            const stored = parsed.videoSettings;
            if (!stored || typeof stored.bitrate !== 'number') {
                return;
            }
            const bounds =
                stored.bounds && typeof stored.bounds.width === 'number' && typeof stored.bounds.height === 'number'
                    ? new Size(stored.bounds.width, stored.bounds.height)
                    : null;
            const crop =
                stored.crop && typeof stored.crop.left === 'number'
                    ? new Rect(stored.crop.left, stored.crop.top, stored.crop.right, stored.crop.bottom)
                    : null;
            const videoSettings = new VideoSettings({
                bitrate: stored.bitrate,
                maxFps: stored.maxFps,
                iFrameInterval: stored.iFrameInterval,
                bounds,
                crop,
                sendFrameMeta: !!stored.sendFrameMeta,
                lockedVideoOrientation:
                    typeof stored.lockedVideoOrientation === 'number' ? stored.lockedVideoOrientation : -1,
                displayId: typeof stored.displayId === 'number' ? stored.displayId : 0,
                codecOptions: stored.codecOptions,
                encoderName: stored.encoderName,
            });
            return { videoSettings, fitToScreen: !!parsed.fitToScreen };
        } catch (error: any) {
            console.error('[StreamSettingsStorage]', 'Failed to load settings', error.message);
            return;
        }
    }

    public static save(videoSettings: VideoSettings, fitToScreen: boolean): void {
        if (!window.localStorage) {
            return;
        }
        try {
            const data = {
                videoSettings: videoSettings.toJSON(),
                fitToScreen,
            };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error: any) {
            console.error('[StreamSettingsStorage]', 'Failed to save settings', error.message);
        }
    }

    /**
     * Applies the stored values on top of the player's settings. Values that
     * depend on the current display (displayId, crop, frame meta) are kept
     * from the base settings; browser orientation is persisted separately.
     */
    public static merge(base: VideoSettings, stored: VideoSettings): VideoSettings {
        return new VideoSettings({
            bitrate: stored.bitrate || base.bitrate,
            maxFps: stored.maxFps || base.maxFps,
            iFrameInterval: stored.iFrameInterval || base.iFrameInterval,
            bounds: stored.bounds ?? base.bounds,
            crop: base.crop,
            sendFrameMeta: base.sendFrameMeta,
            lockedVideoOrientation: -1,
            displayId: base.displayId,
            codecOptions: stored.codecOptions ?? base.codecOptions,
            encoderName: stored.encoderName ?? base.encoderName,
        });
    }
}

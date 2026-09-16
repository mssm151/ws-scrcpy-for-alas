import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { SERVER_PORT } from '../../../common/Constants';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { StreamClientScrcpy } from './StreamClientScrcpy';
import { DeviceState } from '../../../common/DeviceState';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { HostTracker } from '../../client/HostTracker';
import { Tool } from '../../client/Tool';
import StreamSettingsStorage from '../StreamSettingsStorage';

export class DeviceTracker extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();
    protected static tools: Set<Tool> = new Set();
    protected tableId = 'goog_device_list';

    public static start(hostItem: HostItem): DeviceTracker {
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceTracker(hostItem, url);
        }
        return instance;
    }

    public static getInstance(hostItem: HostItem): DeviceTracker {
        return this.start(hostItem);
    }

    protected constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.buildDeviceTable();
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // nothing here;
    }

    protected setIdAndHostName(id: string, hostName: string): void {
        super.setIdAndHostName(id, hostName);
        for (const value of DeviceTracker.instancesByUrl.values()) {
            if (value.id === id && value !== this) {
                console.warn(
                    `Tracker with url: "${this.url}" has the same id(${this.id}) as tracker with url "${value.url}"`,
                );
                console.warn(`This tracker will shut down`);
                this.destroy();
            }
        }
    }

    protected static createUrl(params: ParamsDeviceTracker, udid = ''): URL {
        const secure = !!params.secure;
        const hostname = params.hostname || location.hostname;
        const port = typeof params.port === 'number' ? params.port : secure ? 443 : 80;
        const pathname = params.pathname || location.pathname;
        const urlObject = this.buildUrl({ ...params, secure, hostname, port, pathname });
        if (udid) {
            urlObject.searchParams.set('action', ACTION.PROXY_ADB);
            urlObject.searchParams.set('remote', `tcp:${SERVER_PORT.toString(10)}`);
            urlObject.searchParams.set('udid', udid);
        }
        return urlObject;
    }

    protected buildDeviceRow(tbody: Element, device: GoogDeviceDescriptor): void {
        const isActive = device.state === DeviceState.DEVICE;
        const deviceEl = document.createElement('div');
        deviceEl.className = `device ${isActive ? 'active' : 'not-active'}`;
        deviceEl.title = `${device['ro.product.manufacturer']} ${device['ro.product.model']} (${device.udid})`;

        const connect = document.createElement('button');
        connect.type = 'button';
        connect.className = 'connect-button';
        connect.innerText = '连接';
        if (isActive) {
            connect.title = '使用默认播放器（H264 Converter）连接';
            connect.onclick = (event: MouseEvent) => {
                event.stopPropagation();
                this.connect(device);
            };
        } else {
            connect.disabled = true;
            connect.title = '设备未连接';
        }
        deviceEl.appendChild(connect);

        const state = document.createElement('div');
        state.className = 'device-state';
        state.title = `状态: ${device.state}`;
        const dot = document.createElement('span');
        dot.className = 'state-dot';
        const text = document.createElement('span');
        text.className = 'state-text';
        text.innerText = isActive ? '在线' : '离线';
        state.appendChild(dot);
        state.appendChild(text);
        deviceEl.appendChild(state);

        tbody.appendChild(deviceEl);
    }

    private connect(device: GoogDeviceDescriptor): void {
        const ws = DeviceTracker.createUrl(this.params, device.udid).toString();
        const player = StreamSettingsStorage.loadPlayer() || StreamClientScrcpy.DEFAULT_PLAYER_NAME;
        const q = new URLSearchParams();
        q.set('action', ACTION.STREAM_SCRCPY);
        q.set('udid', device.udid);
        q.set('player', player);
        q.set('ws', ws);
        if (this.params.secure !== undefined) {
            q.set('secure', this.params.secure ? 'true' : 'false');
        }
        if (this.params.hostname) {
            q.set('hostname', this.params.hostname);
        }
        if (typeof this.params.port === 'number') {
            q.set('port', this.params.port.toString(10));
        }
        if (this.params.pathname) {
            q.set('pathname', this.params.pathname);
        }
        if (this.params.useProxy !== undefined) {
            q.set('useProxy', this.params.useProxy ? 'true' : 'false');
        }
        location.hash = `#!${q.toString()}`;
        HostTracker.getInstance().destroy();
        StreamClientScrcpy.start({
            action: ACTION.STREAM_SCRCPY,
            udid: device.udid,
            ws,
            player,
            secure: this.params.secure,
            hostname: this.params.hostname,
            port: this.params.port,
            pathname: this.params.pathname,
            useProxy: this.params.useProxy,
        });
    }

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceTracker.instancesByUrl.delete(this.url.toString());
        if (!DeviceTracker.instancesByUrl.size) {
            const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
            if (holder && holder.parentElement) {
                holder.parentElement.removeChild(holder);
            }
        }
    }
}

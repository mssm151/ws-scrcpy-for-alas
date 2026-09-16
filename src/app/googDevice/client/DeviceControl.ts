import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { ChannelCode } from '../../../common/ChannelCode';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { Message } from '../../../types/Message';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { ParamsStreamScrcpy } from '../../../types/ParamsStreamScrcpy';
import { HostItem } from '../../../types/Configuration';
import { SERVER_PORT } from '../../../common/Constants';

const TAG = '[DeviceControl]';

/**
 * Lightweight tracker connection used by the device (stream) page.
 * Connects to the device tracker websocket channel and forwards
 * descriptor updates to the "More" side panel. Sends control
 * commands (kill server / start server / update interfaces) to the
 * server without rendering the device list table.
 */
export class DeviceControl extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    private static instancesByUrl: Map<string, DeviceControl> = new Map();
    private readonly udid: string;
    private onDevice?: (descriptor: GoogDeviceDescriptor) => void;

    public static start(params: ParamsDeviceTracker, udid: string): DeviceControl {
        const hostItem: HostItem = {
            type: params.type,
            secure: !!params.secure,
            hostname: params.hostname || location.hostname,
            port: typeof params.port === 'number' ? params.port : params.secure ? 443 : 80,
            pathname: params.pathname || location.pathname,
            useProxy: params.useProxy,
        };
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceControl({ ...hostItem, action: DeviceControl.ACTION }, url, udid);
        }
        return instance;
    }

    public static toTrackerParams(params: ParamsStreamScrcpy): ParamsDeviceTracker {
        return {
            ...params,
            type: 'android',
            action: ACTION.GOOG_DEVICE_LIST,
        };
    }

    protected constructor(params: ParamsDeviceTracker, url: string, udid: string) {
        super(params, url);
        this.udid = udid;
        DeviceControl.instancesByUrl.set(url, this);
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // nothing here
    }

    protected buildDeviceRow(): void {
        // no device list table on the stream page
    }

    public setOnDeviceChange(listener: (descriptor: GoogDeviceDescriptor) => void): void {
        this.onDevice = listener;
        const descriptor = this.getDescriptorByUdid(this.udid);
        if (descriptor) {
            listener(descriptor);
        }
    }

    public setBodyClass(_text: string): void {
        // no-op: the stream page owns the body class
    }

    public setTitle(_text?: string): void {
        // no-op: the stream page owns the document title
    }

    protected buildDeviceTable(): void {
        const descriptor = this.getDescriptorByUdid(this.udid);
        if (descriptor && this.onDevice) {
            this.onDevice(descriptor);
        } else {
            console.log(TAG, `No descriptor for udid: "${this.udid}"`);
        }
    }

    public getDescriptor(): GoogDeviceDescriptor | undefined {
        return this.getDescriptorByUdid(this.udid);
    }

    public getId(): string {
        return this.id;
    }

    public static createUrl(params: ParamsDeviceTracker, udid = '', ipv4?: string): URL {
        if (ipv4) {
            return this.buildUrl({
                ...params,
                secure: false,
                hostname: ipv4,
                port: SERVER_PORT,
                pathname: params.pathname || location.pathname,
            });
        }
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

    public sendCommand(command: string, pid?: number): void {
        const data: Message = {
            id: this.getNextId(),
            type: command,
            data: {
                udid: this.udid,
                pid: typeof pid === 'number' ? pid : undefined,
            },
        };
        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn(TAG, `Cannot send "${command}": tracker connection is not open`);
        }
    }

    public killServer(pid: number): void {
        this.sendCommand(ControlCenterCommand.KILL_SERVER, pid);
    }

    public startServer(): void {
        this.sendCommand(ControlCenterCommand.START_SERVER);
    }

    public updateInterfaces(): void {
        this.sendCommand(ControlCenterCommand.UPDATE_INTERFACES);
    }

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceControl.instancesByUrl.delete(this.url.toString());
    }
}

import { ACTION } from '../../../common/Action';
import { DeviceState } from '../../../common/DeviceState';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { DeviceControl } from '../client/DeviceControl';
import { Attribute } from '../../Attribute';
import Util from '../../Util';
import StreamSettingsStorage from '../StreamSettingsStorage';

export const DEFAULT_PLAYER_CODE = 'mse';

export interface DeviceMoreBoxParams {
    udid: string;
    trackerParams: ParamsDeviceTracker;
    onClose?: () => void;
}

/**
 * Side panel shown on the device (stream) page. Houses the features that
 * used to live on the device list page: tools links, server control
 * (kill/start server), interface selection and a way back to the list.
 */
export class DeviceMoreBox {
    private readonly holder: HTMLElement;
    private readonly control: DeviceControl;
    private readonly udid: string;
    private readonly trackerParams: ParamsDeviceTracker;
    private readonly onClose?: () => void;

    constructor(params: DeviceMoreBoxParams) {
        const { udid, trackerParams, onClose } = params;
        this.udid = udid;
        this.trackerParams = trackerParams;
        this.onClose = onClose;
        this.holder = DeviceMoreBox.createUI(this);
        this.control = DeviceControl.start(trackerParams, udid);
        this.control.setOnDeviceChange(this.onDeviceChange);
    }

    public getHolderElement(): HTMLElement {
        return this.holder;
    }

    public destroy(): void {
        this.control.destroy();
    }

    private onDeviceChange = (descriptor: GoogDeviceDescriptor): void => {
        this.renderSummary(descriptor);
        this.renderServerSection(descriptor);
    };

    private renderSummary(descriptor: GoogDeviceDescriptor): void {
        const summary = this.holder.querySelector('.device-summary-row') as HTMLElement | null;
        if (!summary) {
            return;
        }
        const name = summary.querySelector('.device-name') as HTMLElement | null;
        if (name) {
            name.innerText = `${descriptor['ro.product.manufacturer']} ${descriptor['ro.product.model']}`;
        }
        const state = summary.querySelector('.device-state') as HTMLElement | null;
        if (state) {
            const active = descriptor.state === DeviceState.DEVICE;
            state.classList.toggle('active', active);
            state.title = `State: ${descriptor.state}`;
        }
    }

    private renderServerSection(descriptor: GoogDeviceDescriptor): void {
        const body = this.holder.querySelector('.server-body') as HTMLElement | null;
        if (!body) {
            return;
        }
        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }
        const active = descriptor.state === DeviceState.DEVICE;

        const pidRow = document.createElement('div');
        pidRow.className = 'server-info';
        const pidValue = document.createElement('span');
        pidValue.className = 'server-pid-value';
        pidValue.innerText =
            descriptor.pid !== -1 ? `PID ${descriptor.pid}` : active ? 'scrcpy 服务未运行' : '设备未连接';
        pidRow.appendChild(pidValue);
        body.appendChild(pidRow);

        if (descriptor.pid !== -1) {
            const kill = document.createElement('button');
            kill.type = 'button';
            kill.className = 'panel-button danger';
            kill.innerText = '结束服务';
            kill.title = `结束 scrcpy 服务 (PID ${descriptor.pid})`;
            kill.onclick = () => {
                this.control.killServer(descriptor.pid);
            };
            body.appendChild(kill);
        } else if (active) {
            const start = document.createElement('button');
            start.type = 'button';
            start.className = 'panel-button primary';
            start.innerText = '启动服务';
            start.title = '在设备上启动 scrcpy 服务';
            start.onclick = () => {
                this.control.startServer();
            };
            body.appendChild(start);
        }

        /// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
        if (active && descriptor.interfaces && descriptor.interfaces.length) {
            const ifaceRow = document.createElement('div');
            ifaceRow.className = 'interface-row';
            const label = document.createElement('div');
            label.className = 'section-title';
            label.innerText = '网络接口';
            ifaceRow.appendChild(label);
            const select = document.createElement('select');
            select.className = 'panel-select';
            const fullName = `${this.control.getId()}_${Util.escapeUdid(this.udid)}`;
            const storageKey = `device_list::${fullName}::interface`;
            const lastSelected = window.localStorage && localStorage.getItem(storageKey);
            descriptor.interfaces.forEach((value) => {
                const optionElement = document.createElement('option');
                optionElement.innerText = `${value.name}: ${value.ipv4}`;
                optionElement.setAttribute(
                    Attribute.URL,
                    DeviceControl.createUrl(this.trackerParams, this.udid, value.ipv4).toString(),
                );
                optionElement.setAttribute(Attribute.NAME, value.name);
                if (lastSelected === value.name || (!lastSelected && descriptor['wifi.interface'] === value.name)) {
                    optionElement.selected = true;
                }
                select.appendChild(optionElement);
            });
            select.onchange = this.onInterfaceSelected;
            ifaceRow.appendChild(select);
            const updateButton = document.createElement('button');
            updateButton.type = 'button';
            updateButton.className = 'panel-button ghost small';
            updateButton.innerText = '刷新接口';
            updateButton.onclick = () => {
                this.control.updateInterfaces();
            };
            ifaceRow.appendChild(updateButton);
            body.appendChild(ifaceRow);
        }
        /// #endif
    }

    private onInterfaceSelected = (event: Event): void => {
        const selectElement = event.currentTarget as HTMLSelectElement;
        const option = selectElement.selectedOptions[0];
        const url = decodeURI(option.getAttribute(Attribute.URL) || '');
        const name = option.getAttribute(Attribute.NAME) || '';
        if (window.localStorage && name) {
            const fullName = `${this.control.getId()}_${Util.escapeUdid(this.udid)}`;
            localStorage.setItem(`device_list::${fullName}::interface`, name);
        }
        this.reconnectWith(url);
    };

    private reconnectWith(wsUrl: string): void {
        const q = new URLSearchParams();
        q.set('action', ACTION.STREAM_SCRCPY);
        q.set('udid', this.udid);
        q.set('player', StreamSettingsStorage.loadPlayer() || DEFAULT_PLAYER_CODE);
        q.set('ws', wsUrl);
        const storedSettings = StreamSettingsStorage.load();
        q.set('fitToScreen', String(storedSettings ? storedSettings.fitToScreen : true));
        if (this.trackerParams.secure !== undefined) {
            q.set('secure', this.trackerParams.secure ? 'true' : 'false');
        }
        if (this.trackerParams.hostname) {
            q.set('hostname', this.trackerParams.hostname);
        }
        if (typeof this.trackerParams.port === 'number') {
            q.set('port', this.trackerParams.port.toString(10));
        }
        if (this.trackerParams.pathname) {
            q.set('pathname', this.trackerParams.pathname);
        }
        if (this.trackerParams.useProxy !== undefined) {
            q.set('useProxy', this.trackerParams.useProxy ? 'true' : 'false');
        }
        location.hash = `#!${q.toString()}`;
        location.reload();
    }

    private static createUI(box: DeviceMoreBox): HTMLElement {
        const boxElement = document.createElement('div');
        boxElement.className = 'more-box device-more-box';

        const header = document.createElement('div');
        header.className = 'panel-header';
        const title = document.createElement('span');
        title.className = 'panel-title';
        title.innerText = '更多';
        header.appendChild(title);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'panel-close';
        close.title = '关闭';
        close.setAttribute('aria-label', '关闭面板');
        close.innerText = '×';
        close.onclick = () => {
            box.onClose && box.onClose();
        };
        header.appendChild(close);
        boxElement.appendChild(header);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'panel-body';
        boxElement.appendChild(bodyEl);

        // Device summary
        const summary = document.createElement('div');
        summary.className = 'panel-section device-summary';
        summary.innerHTML = `
            <div class="section-title">设备</div>
            <div class="device-summary-row">
                <div class="device-name">…</div>
                <div class="device-state"></div>
            </div>
        `;
        bodyEl.appendChild(summary);

        // Tools (former device list entries)
        const tools = document.createElement('div');
        tools.className = 'panel-section';
        const toolsTitle = document.createElement('div');
        toolsTitle.className = 'section-title';
        toolsTitle.innerText = '工具';
        tools.appendChild(toolsTitle);
        const links = document.createElement('div');
        links.className = 'tool-links';
        const udid = box.udid;
        const shell = BaseDeviceTracker.buildLink({ action: ACTION.SHELL, udid }, '终端', box.trackerParams);
        const devtools = BaseDeviceTracker.buildLink({ action: ACTION.DEVTOOLS, udid }, '调试', box.trackerParams);
        const files = BaseDeviceTracker.buildLink({ action: ACTION.FILE_LISTING, udid }, '文件', box.trackerParams);
        links.appendChild(shell);
        links.appendChild(devtools);
        links.appendChild(files);
        tools.appendChild(links);
        bodyEl.appendChild(tools);

        // Server control (PID / interfaces rendered on device update)
        const server = document.createElement('div');
        server.className = 'panel-section';
        const serverTitle = document.createElement('div');
        serverTitle.className = 'section-title';
        serverTitle.innerText = '服务器';
        server.appendChild(serverTitle);
        const serverBody = document.createElement('div');
        serverBody.className = 'server-body';
        server.appendChild(serverBody);
        bodyEl.appendChild(server);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'panel-footer';
        const reconnect = document.createElement('button');
        reconnect.type = 'button';
        reconnect.className = 'panel-button primary';
        reconnect.innerText = '重新连接';
        reconnect.title = '使用当前接口重新加载画面';
        reconnect.onclick = () => {
            box.reconnectWith(DeviceControl.createUrl(box.trackerParams, box.udid).toString());
        };
        footer.appendChild(reconnect);
        const back = document.createElement('a');
        back.className = 'panel-button ghost';
        back.innerText = '返回设备列表';
        back.href = box.trackerParams.pathname || location.pathname;
        footer.appendChild(back);
        boxElement.appendChild(footer);

        return boxElement;
    }
}

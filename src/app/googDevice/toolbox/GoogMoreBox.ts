import '../../../style/morebox.css';
import { BasePlayer } from '../../player/BasePlayer';
import { TextControlMessage } from '../../controlMessage/TextControlMessage';
import { CommandControlMessage } from '../../controlMessage/CommandControlMessage';
import { ControlMessage } from '../../controlMessage/ControlMessage';
import Size from '../../Size';
import DeviceMessage from '../DeviceMessage';
import VideoSettings from '../../VideoSettings';
import { StreamClientScrcpy } from '../client/StreamClientScrcpy';
import StreamSettingsStorage from '../StreamSettingsStorage';

const TAG = '[GoogMoreBox]';

const COMMAND_LABELS: Map<number, string> = new Map([
    [ControlMessage.TYPE_EXPAND_NOTIFICATION_PANEL, '展开通知栏'],
    [ControlMessage.TYPE_EXPAND_SETTINGS_PANEL, '展开快捷设置'],
    [ControlMessage.TYPE_COLLAPSE_PANELS, '收起面板'],
    [ControlMessage.TYPE_GET_CLIPBOARD, '获取剪贴板'],
    [ControlMessage.TYPE_SET_CLIPBOARD, '发送剪贴板'],
    [ControlMessage.TYPE_ROTATE_DEVICE, '旋转屏幕'],
    [ControlMessage.TYPE_CHANGE_STREAM_PARAMETERS, '视频参数'],
]);

export class GoogMoreBox {
    private static defaultSize = new Size(480, 480);
    private onStop?: () => void;
    private readonly holder: HTMLElement;
    private readonly input: HTMLTextAreaElement;
    private readonly bitrateInput?: HTMLInputElement;
    private readonly maxFpsInput?: HTMLInputElement;
    private readonly iFrameIntervalInput?: HTMLInputElement;
    private readonly maxWidthInput?: HTMLInputElement;
    private readonly maxHeightInput?: HTMLInputElement;

    constructor(
        udid: string,
        private player: BasePlayer,
        private client: StreamClientScrcpy,
        videoSettings: VideoSettings = player.getVideoSettings(),
    ) {
        const playerName = player.getName();
        const { displayId } = videoSettings;
        const preferredSettings = player.getPreferredVideoSetting();
        const settingsBox = document.createElement('div');
        settingsBox.className = 'more-box settings-box';

        const header = document.createElement('div');
        header.className = 'panel-header';
        const title = document.createElement('span');
        title.className = 'panel-title';
        title.innerText = '设置';
        header.appendChild(title);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'panel-close';
        close.title = '关闭';
        close.setAttribute('aria-label', '关闭设置');
        close.innerText = '×';
        close.onclick = () => {
            this.client.toggleSettingsPanel();
        };
        header.appendChild(close);
        settingsBox.appendChild(header);

        const panelBody = document.createElement('div');
        panelBody.className = 'panel-body';
        settingsBox.appendChild(panelBody);

        const nameBox = document.createElement('p');
        nameBox.innerText = `${udid} (${playerName})`;
        nameBox.className = 'text-with-shadow panel-device';
        panelBody.appendChild(nameBox);

        // Decoder (player) selection: applying reloads the page to reconnect.
        // Each option is labeled with its decode path (硬解 = hardware decode via
        // the browser's native decoder, 软解 = software/WASM decode in JS).
        const decoderGroup = document.createElement('div');
        decoderGroup.className = 'settings-group decoder-group';
        const decoderLabel = document.createElement('label');
        decoderLabel.className = 'settings-label';
        decoderLabel.innerText = '解码器';
        decoderGroup.appendChild(decoderLabel);
        const decoderSelect = document.createElement('select');
        decoderSelect.className = 'panel-select';
        const decodeTypeOf: Map<string, string> = new Map();
        StreamClientScrcpy.getPlayers().forEach((playerClass) => {
            const tag = playerClass.decodeType === 'hardware' ? '硬解' : '软解';
            decodeTypeOf.set(playerClass.playerFullName, tag);
            const option = document.createElement('option');
            option.value = playerClass.playerFullName;
            option.innerText = `${playerClass.playerFullName}（${tag}）`;
            if (playerClass.playerFullName === playerName) {
                option.selected = true;
            }
            decoderSelect.appendChild(option);
        });
        decoderGroup.appendChild(decoderSelect);
        const applyDecoder = document.createElement('button');
        applyDecoder.type = 'button';
        applyDecoder.className = 'panel-button primary';
        applyDecoder.innerText = '应用并重连';
        applyDecoder.title = '重新连接并使用所选解码器';
        applyDecoder.disabled = true;
        decoderSelect.onchange = () => {
            applyDecoder.disabled = decoderSelect.value === playerName;
        };
        applyDecoder.onclick = () => {
            const selected = decoderSelect.value;
            if (!selected || selected === playerName) {
                return;
            }
            StreamSettingsStorage.savePlayer(selected);
            client.reconnectWithPlayer(selected);
        };
        decoderGroup.appendChild(applyDecoder);
        const decodeStatus = document.createElement('p');
        decodeStatus.className = 'decode-status';
        const currentTag = decodeTypeOf.get(playerName) || '';
        decodeStatus.innerText = `当前：${playerName}（${currentTag}）`;
        decoderGroup.appendChild(decodeStatus);
        panelBody.appendChild(decoderGroup);

        const input = (this.input = document.createElement('textarea'));
        input.classList.add('text-area');
        input.placeholder = '输入文本，发送到设备…';
        const sendButton = document.createElement('button');
        sendButton.innerText = '发送按键';
        sendButton.className = 'panel-button';

        const inputWrapper = GoogMoreBox.wrap('div', [input, sendButton], panelBody, ['settings-group', 'text-group']);
        sendButton.onclick = () => {
            if (input.value) {
                client.sendMessage(new TextControlMessage(input.value));
            }
        };

        const commands: HTMLElement[] = [];
        const codes = CommandControlMessage.Commands;
        for (const [action] of codes.entries()) {
            const label = COMMAND_LABELS.get(action) || codes.get(action) || '';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'panel-button';
            let bitrateInput: HTMLInputElement;
            let maxFpsInput: HTMLInputElement;
            let iFrameIntervalInput: HTMLInputElement;
            let maxWidthInput: HTMLInputElement;
            let maxHeightInput: HTMLInputElement;
            if (action === ControlMessage.TYPE_CHANGE_STREAM_PARAMETERS) {
                const spoiler = document.createElement('div');
                const spoilerLabel = document.createElement('label');
                const spoilerCheck = document.createElement('input');

                const innerDiv = document.createElement('div');
                const id = `spoiler_video_${udid}_${playerName}_${displayId}_${action}`;

                spoiler.className = 'spoiler settings-group';
                spoilerCheck.type = 'checkbox';
                spoilerCheck.id = id;
                spoilerLabel.htmlFor = id;
                spoilerLabel.innerText = label;
                innerDiv.className = 'box settings-grid';
                spoiler.appendChild(spoilerCheck);
                spoiler.appendChild(spoilerLabel);
                spoiler.appendChild(innerDiv);

                const bitrateLabel = document.createElement('label');
                bitrateLabel.innerText = '码率 (bps)';
                bitrateInput = document.createElement('input');
                bitrateInput.placeholder = `${preferredSettings.bitrate} bps`;
                bitrateInput.value = videoSettings.bitrate.toString();
                GoogMoreBox.wrap('div', [bitrateLabel, bitrateInput], innerDiv, ['settings-row']);
                this.bitrateInput = bitrateInput;

                const maxFpsLabel = document.createElement('label');
                maxFpsLabel.innerText = '最大帧率';
                maxFpsInput = document.createElement('input');
                maxFpsInput.placeholder = `${preferredSettings.maxFps} fps`;
                maxFpsInput.value = videoSettings.maxFps.toString();
                GoogMoreBox.wrap('div', [maxFpsLabel, maxFpsInput], innerDiv, ['settings-row']);
                this.maxFpsInput = maxFpsInput;

                const iFrameIntervalLabel = document.createElement('label');
                iFrameIntervalLabel.innerText = 'I 帧间隔（秒）';
                iFrameIntervalInput = document.createElement('input');
                iFrameIntervalInput.placeholder = `${preferredSettings.iFrameInterval} seconds`;
                iFrameIntervalInput.value = videoSettings.iFrameInterval.toString();
                GoogMoreBox.wrap('div', [iFrameIntervalLabel, iFrameIntervalInput], innerDiv, ['settings-row']);
                this.iFrameIntervalInput = iFrameIntervalInput;

                const { width, height } = videoSettings.bounds || client.getMaxSize() || GoogMoreBox.defaultSize;
                const pWidth = preferredSettings.bounds?.width || width;
                const pHeight = preferredSettings.bounds?.height || height;

                const maxWidthLabel = document.createElement('label');
                maxWidthLabel.innerText = '最大宽度 (px)';
                maxWidthInput = document.createElement('input');
                maxWidthInput.placeholder = `${pWidth} px`;
                maxWidthInput.value = width.toString();
                GoogMoreBox.wrap('div', [maxWidthLabel, maxWidthInput], innerDiv, ['settings-row']);
                this.maxWidthInput = maxWidthInput;

                const maxHeightLabel = document.createElement('label');
                maxHeightLabel.innerText = '最大高度 (px)';
                maxHeightInput = document.createElement('input');
                maxHeightInput.placeholder = `${pHeight} px`;
                maxHeightInput.value = height.toString();
                GoogMoreBox.wrap('div', [maxHeightLabel, maxHeightInput], innerDiv, ['settings-row']);
                this.maxHeightInput = maxHeightInput;

                const orientationLabel = document.createElement('label');
                orientationLabel.innerText = '浏览器方向';
                const orientationSelect = document.createElement('select');
                orientationSelect.className = 'panel-select';
                const orientationOptions: Array<[number, string]> = [
                    [90, '横屏'],
                    [0, '竖屏'],
                ];
                const defaultOrientation = StreamSettingsStorage.loadBrowserOrientation() ?? 90;
                for (const [value, text] of orientationOptions) {
                    const opt = document.createElement('option');
                    opt.value = value.toString();
                    opt.innerText = text;
                    if (value === defaultOrientation) {
                        opt.selected = true;
                    }
                    orientationSelect.appendChild(opt);
                }
                orientationSelect.onchange = () => {
                    const value = parseInt(orientationSelect.value, 10);
                    if (value === 0 || value === 90) {
                        StreamSettingsStorage.saveBrowserOrientation(value);
                    }
                };
                GoogMoreBox.wrap('div', [orientationLabel, orientationSelect], innerDiv, ['settings-row']);

                innerDiv.appendChild(btn);
                const fitButton = document.createElement('button');
                fitButton.type = 'button';
                fitButton.className = 'panel-button ghost small';
                fitButton.innerText = '适应屏幕';
                fitButton.onclick = this.fit;
                innerDiv.insertBefore(fitButton, innerDiv.firstChild);
                const resetButton = document.createElement('button');
                resetButton.type = 'button';
                resetButton.className = 'panel-button ghost small';
                resetButton.innerText = '重置';
                resetButton.onclick = this.reset;
                innerDiv.insertBefore(resetButton, innerDiv.firstChild);
                commands.push(spoiler);
            } else {
                if (
                    action === CommandControlMessage.TYPE_SET_CLIPBOARD ||
                    action === CommandControlMessage.TYPE_GET_CLIPBOARD
                ) {
                    inputWrapper.appendChild(btn);
                } else {
                    commands.push(btn);
                }
            }
            btn.innerText = label;
            if (action === ControlMessage.TYPE_CHANGE_STREAM_PARAMETERS) {
                btn.className = 'panel-button primary';
                btn.innerText = '应用并保存';
                btn.onclick = () => {
                    const bitrate = parseInt(bitrateInput.value, 10);
                    const maxFps = parseInt(maxFpsInput.value, 10);
                    const iFrameInterval = parseInt(iFrameIntervalInput.value, 10);
                    if (isNaN(bitrate) || isNaN(maxFps)) {
                        return;
                    }
                    const width = parseInt(maxWidthInput.value, 10) & ~15;
                    const height = parseInt(maxHeightInput.value, 10) & ~15;
                    const bounds = new Size(width, height);
                    const current = player.getVideoSettings();
                    const { sendFrameMeta, displayId, codecOptions, encoderName } = current;
                    const videoSettings = new VideoSettings({
                        bounds,
                        bitrate,
                        maxFps,
                        iFrameInterval,
                        lockedVideoOrientation: -1,
                        sendFrameMeta,
                        displayId,
                        codecOptions,
                        encoderName,
                    });
                    client.sendNewVideoSetting(videoSettings);
                    const maxSize = client.getMaxSize();
                    const fitToScreen = !!videoSettings.bounds && !!maxSize && videoSettings.bounds.equals(maxSize);
                    StreamSettingsStorage.save(videoSettings, fitToScreen);
                };
            } else if (action === CommandControlMessage.TYPE_SET_CLIPBOARD) {
                btn.onclick = () => {
                    const text = input.value;
                    if (text) {
                        client.sendMessage(CommandControlMessage.createSetClipboardCommand(text));
                    }
                };
            } else {
                btn.onclick = () => {
                    client.sendMessage(new CommandControlMessage(action));
                };
            }
        }
        GoogMoreBox.wrap('div', commands, panelBody, ['settings-group', 'commands-group']);

        const screenPowerModeId = `screen_power_mode_${udid}_${playerName}_${displayId}`;
        const screenPowerModeLabel = document.createElement('label');
        screenPowerModeLabel.style.display = 'none';
        const labelTextPrefix = '状态';
        const buttonTextPrefix = '设置屏幕电源';
        const screenPowerModeCheck = document.createElement('input');
        screenPowerModeCheck.type = 'checkbox';
        let mode = (screenPowerModeCheck.checked = false) ? '开' : '关';
        screenPowerModeCheck.id = screenPowerModeLabel.htmlFor = screenPowerModeId;
        screenPowerModeLabel.innerText = `${labelTextPrefix} ${mode}`;
        screenPowerModeCheck.onchange = () => {
            mode = screenPowerModeCheck.checked ? '开' : '关';
            screenPowerModeLabel.innerText = `${labelTextPrefix} ${mode}`;
            sendScreenPowerModeButton.innerText = `${buttonTextPrefix} ${mode}`;
        };
        const sendScreenPowerModeButton = document.createElement('button');
        sendScreenPowerModeButton.type = 'button';
        sendScreenPowerModeButton.className = 'panel-button';
        sendScreenPowerModeButton.innerText = `${buttonTextPrefix} ${mode}`;
        sendScreenPowerModeButton.onclick = () => {
            const message = CommandControlMessage.createSetScreenPowerModeCommand(screenPowerModeCheck.checked);
            client.sendMessage(message);
        };
        GoogMoreBox.wrap('div', [screenPowerModeCheck, screenPowerModeLabel, sendScreenPowerModeButton], panelBody, [
            'settings-group',
            'flex-center',
        ]);

        const qualityId = `show_video_quality_${udid}_${playerName}_${displayId}`;
        const qualityLabel = document.createElement('label');
        const qualityCheck = document.createElement('input');
        qualityCheck.type = 'checkbox';
        qualityCheck.className = 'panel-checkbox';
        qualityCheck.checked = BasePlayer.DEFAULT_SHOW_QUALITY_STATS;
        qualityCheck.id = qualityId;
        qualityLabel.htmlFor = qualityId;
        qualityLabel.innerText = '显示质量统计';
        GoogMoreBox.wrap('div', [qualityCheck, qualityLabel], panelBody, ['settings-group', 'flex-center']);
        qualityCheck.onchange = () => {
            player.setShowQualityStats(qualityCheck.checked);
        };

        const stop = (ev?: string | Event) => {
            if (ev && ev instanceof Event && ev.type === 'error') {
                console.error(TAG, ev);
            }
            const parent = settingsBox.parentElement;
            if (parent) {
                parent.removeChild(settingsBox);
            }
            player.off('video-settings', this.onVideoSettings);
            if (this.onStop) {
                this.onStop();
                delete this.onStop;
            }
        };

        const stopBtn = document.createElement('button') as HTMLButtonElement;
        stopBtn.type = 'button';
        stopBtn.className = 'panel-button danger';
        stopBtn.innerText = `断开连接`;
        stopBtn.onclick = stop;

        GoogMoreBox.wrap('div', [stopBtn], panelBody, ['settings-group', 'panel-footer']);
        player.on('video-settings', this.onVideoSettings);
        this.holder = settingsBox;
    }

    private onVideoSettings = (videoSettings: VideoSettings): void => {
        if (this.bitrateInput) {
            this.bitrateInput.value = videoSettings.bitrate.toString();
        }
        if (this.maxFpsInput) {
            this.maxFpsInput.value = videoSettings.maxFps.toString();
        }
        if (this.iFrameIntervalInput) {
            this.iFrameIntervalInput.value = videoSettings.iFrameInterval.toString();
        }
        if (videoSettings.bounds) {
            const { width, height } = videoSettings.bounds;
            if (this.maxWidthInput) {
                this.maxWidthInput.value = width.toString();
            }
            if (this.maxHeightInput) {
                this.maxHeightInput.value = height.toString();
            }
        }
    };

    private fit = (): void => {
        const { width, height } = this.client.getMaxSize() || GoogMoreBox.defaultSize;
        if (this.maxWidthInput) {
            this.maxWidthInput.value = width.toString();
        }
        if (this.maxHeightInput) {
            this.maxHeightInput.value = height.toString();
        }
    };

    private reset = (): void => {
        const preferredSettings = this.player.getPreferredVideoSetting();
        if (this.bitrateInput) {
            this.bitrateInput.value = preferredSettings.bitrate.toString();
        }
        if (this.maxFpsInput) {
            this.maxFpsInput.value = preferredSettings.maxFps.toString();
        }
        if (this.iFrameIntervalInput) {
            this.iFrameIntervalInput.value = preferredSettings.iFrameInterval.toString();
        }
        if (preferredSettings.bounds) {
            const { width, height } = preferredSettings.bounds;
            if (this.maxWidthInput) {
                this.maxWidthInput.value = width.toString();
            }
            if (this.maxHeightInput) {
                this.maxHeightInput.value = height.toString();
            }
        }
    };

    public OnDeviceMessage(ev: DeviceMessage): void {
        if (ev.type !== DeviceMessage.TYPE_CLIPBOARD) {
            return;
        }
        this.input.value = ev.getText();
        this.input.select();
        document.execCommand('copy');
    }

    private static wrap(
        tagName: string,
        elements: HTMLElement[],
        parent: HTMLElement,
        opt_classes?: string[],
    ): HTMLElement {
        const wrap = document.createElement(tagName);
        if (opt_classes) {
            wrap.classList.add(...opt_classes);
        }
        elements.forEach((e) => {
            wrap.appendChild(e);
        });
        parent.appendChild(wrap);
        return wrap;
    }

    public getHolderElement(): HTMLElement {
        return this.holder;
    }

    public setOnStop(listener: () => void): void {
        this.onStop = listener;
    }
}

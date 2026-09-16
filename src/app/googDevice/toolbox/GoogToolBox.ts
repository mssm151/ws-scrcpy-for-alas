import KeyEvent from '../android/KeyEvent';
import SvgImage, { Icon } from '../../ui/SvgImage';
import { KeyCodeControlMessage } from '../../controlMessage/KeyCodeControlMessage';
import { ToolBoxButton } from '../../toolbox/ToolBoxButton';
import { ToolBoxElement } from '../../toolbox/ToolBoxElement';
import { ToolBoxCheckbox } from '../../toolbox/ToolBoxCheckbox';
import { StreamClientScrcpy } from '../client/StreamClientScrcpy';
import { BasePlayer } from '../../player/BasePlayer';

type ToolBoxButtonDef = {
    title: string;
    code: number;
    icon: Icon;
    side: 'left' | 'right';
};

const BUTTONS: ToolBoxButtonDef[] = [
    {
        title: '电源',
        code: KeyEvent.KEYCODE_POWER,
        icon: SvgImage.Icon.POWER,
        side: 'left',
    },
    {
        title: '音量加',
        code: KeyEvent.KEYCODE_VOLUME_UP,
        icon: SvgImage.Icon.VOLUME_UP,
        side: 'left',
    },
    {
        title: '音量减',
        code: KeyEvent.KEYCODE_VOLUME_DOWN,
        icon: SvgImage.Icon.VOLUME_DOWN,
        side: 'left',
    },
    {
        title: '返回',
        code: KeyEvent.KEYCODE_BACK,
        icon: SvgImage.Icon.BACK,
        side: 'right',
    },
    {
        title: '主页',
        code: KeyEvent.KEYCODE_HOME,
        icon: SvgImage.Icon.HOME,
        side: 'right',
    },
    {
        title: '最近任务',
        code: KeyEvent.KEYCODE_APP_SWITCH,
        icon: SvgImage.Icon.OVERVIEW,
        side: 'right',
    },
];

type PanelState = {
    edgeId: number | null;
    holderId: number | null;
    edgeTriggered: boolean;
    holderTriggered: boolean;
    edgeStartX: number;
    edgeStartY: number;
    holderStartX: number;
    holderStartY: number;
};

class EdgePanel {
    private readonly state: PanelState = {
        edgeId: null,
        holderId: null,
        edgeTriggered: false,
        holderTriggered: false,
        edgeStartX: 0,
        edgeStartY: 0,
        holderStartX: 0,
        holderStartY: 0,
    };

    constructor(
        private readonly edge: HTMLElement,
        private readonly holder: HTMLElement,
        private readonly supportsPointer: boolean,
        private readonly isEnabled: () => boolean,
        private readonly isOpen: () => boolean,
        private readonly setOpen: (open: boolean) => void,
        private readonly openSign: number,
    ) {}

    public bind(): void {
        if (this.supportsPointer) {
            this.edge.addEventListener('pointerdown', this.onEdgeDown);
            this.edge.addEventListener('pointermove', this.onEdgeMove);
            this.edge.addEventListener('pointerup', this.onEdgeEnd);
            this.edge.addEventListener('pointercancel', this.onEdgeEnd);
            this.holder.addEventListener('pointerdown', this.onHolderDown);
            this.holder.addEventListener('pointermove', this.onHolderMove);
            this.holder.addEventListener('pointerup', this.onHolderEnd);
            this.holder.addEventListener('pointercancel', this.onHolderEnd);
            document.addEventListener('pointerdown', this.onDocumentDown);
        } else {
            this.edge.addEventListener('touchstart', this.onEdgeTouchStart, { passive: false });
            this.edge.addEventListener('touchmove', this.onEdgeTouchMove, { passive: false });
            this.edge.addEventListener('touchend', this.onEdgeTouchEnd);
            this.edge.addEventListener('touchcancel', this.onEdgeTouchEnd);
            this.holder.addEventListener('touchstart', this.onHolderTouchStart, { passive: false });
            this.holder.addEventListener('touchmove', this.onHolderTouchMove, { passive: false });
            this.holder.addEventListener('touchend', this.onHolderTouchEnd);
            this.holder.addEventListener('touchcancel', this.onHolderTouchEnd);
            document.addEventListener('touchstart', this.onDocumentTouchStart);
        }
    }

    public release(): void {
        if (this.supportsPointer) {
            this.edge.removeEventListener('pointerdown', this.onEdgeDown);
            this.edge.removeEventListener('pointermove', this.onEdgeMove);
            this.edge.removeEventListener('pointerup', this.onEdgeEnd);
            this.edge.removeEventListener('pointercancel', this.onEdgeEnd);
            this.holder.removeEventListener('pointerdown', this.onHolderDown);
            this.holder.removeEventListener('pointermove', this.onHolderMove);
            this.holder.removeEventListener('pointerup', this.onHolderEnd);
            this.holder.removeEventListener('pointercancel', this.onHolderEnd);
            document.removeEventListener('pointerdown', this.onDocumentDown);
        } else {
            this.edge.removeEventListener('touchstart', this.onEdgeTouchStart);
            this.edge.removeEventListener('touchmove', this.onEdgeTouchMove);
            this.edge.removeEventListener('touchend', this.onEdgeTouchEnd);
            this.edge.removeEventListener('touchcancel', this.onEdgeTouchEnd);
            this.holder.removeEventListener('touchstart', this.onHolderTouchStart);
            this.holder.removeEventListener('touchmove', this.onHolderTouchMove);
            this.holder.removeEventListener('touchend', this.onHolderTouchEnd);
            this.holder.removeEventListener('touchcancel', this.onHolderTouchEnd);
            document.removeEventListener('touchstart', this.onDocumentTouchStart);
        }
        this.reset();
    }

    public reset(): void {
        if (this.state.edgeId !== null && this.edge.hasPointerCapture(this.state.edgeId)) {
            this.edge.releasePointerCapture(this.state.edgeId);
        }
        this.state.edgeId = null;
        this.state.holderId = null;
        this.state.edgeTriggered = false;
        this.state.holderTriggered = false;
        this.state.edgeStartX = 0;
        this.state.edgeStartY = 0;
        this.state.holderStartX = 0;
        this.state.holderStartY = 0;
    }

    private shouldTrigger(deltaX: number, deltaY: number, sign: number): boolean {
        return sign * deltaX > 24 && Math.abs(deltaY) < 48;
    }

    private onEdgeDown = (event: PointerEvent): void => {
        if (!this.isEnabled() || !event.isPrimary || this.state.edgeId !== null) {
            return;
        }
        this.state.edgeId = event.pointerId;
        this.state.edgeTriggered = false;
        this.state.edgeStartX = event.clientX;
        this.state.edgeStartY = event.clientY;
        this.edge.setPointerCapture(event.pointerId);
    };

    private onEdgeMove = (event: PointerEvent): void => {
        if (!this.isEnabled() || this.state.edgeId !== event.pointerId) {
            return;
        }
        const deltaX = event.clientX - this.state.edgeStartX;
        const deltaY = event.clientY - this.state.edgeStartY;
        if (!this.state.edgeTriggered && this.shouldTrigger(deltaX, deltaY, this.openSign)) {
            this.state.edgeTriggered = true;
            this.setOpen(true);
        }
    };

    private onEdgeEnd = (event: PointerEvent): void => {
        if (this.state.edgeId !== event.pointerId) {
            return;
        }
        this.state.edgeId = null;
        this.state.edgeTriggered = false;
        if (this.edge.hasPointerCapture(event.pointerId)) {
            this.edge.releasePointerCapture(event.pointerId);
        }
    };

    private onHolderDown = (event: PointerEvent): void => {
        if (!this.isEnabled() || !event.isPrimary || this.state.holderId !== null) {
            return;
        }
        this.state.holderId = event.pointerId;
        this.state.holderTriggered = false;
        this.state.holderStartX = event.clientX;
        this.state.holderStartY = event.clientY;
    };

    private onHolderMove = (event: PointerEvent): void => {
        if (!this.isEnabled() || this.state.holderId !== event.pointerId) {
            return;
        }
        const deltaX = event.clientX - this.state.holderStartX;
        const deltaY = event.clientY - this.state.holderStartY;
        if (!this.state.holderTriggered && this.shouldTrigger(deltaX, deltaY, -this.openSign)) {
            this.state.holderTriggered = true;
            this.setOpen(false);
        }
    };

    private onHolderEnd = (event: PointerEvent): void => {
        if (this.state.holderId !== event.pointerId) {
            return;
        }
        this.state.holderId = null;
        this.state.holderTriggered = false;
    };

    private onDocumentDown = (event: PointerEvent): void => {
        if (!this.isEnabled() || !this.isOpen()) {
            return;
        }
        const target = event.target as Node | null;
        if (target && this.holder.contains(target)) {
            return;
        }
        this.setOpen(false);
    };

    private onEdgeTouchStart = (event: TouchEvent): void => {
        if (!this.isEnabled() || this.state.edgeId !== null) {
            return;
        }
        const touch = event.changedTouches[0];
        if (!touch) {
            return;
        }
        this.state.edgeId = touch.identifier;
        this.state.edgeTriggered = false;
        this.state.edgeStartX = touch.clientX;
        this.state.edgeStartY = touch.clientY;
    };

    private onEdgeTouchMove = (event: TouchEvent): void => {
        if (!this.isEnabled() || this.state.edgeId === null) {
            return;
        }
        const touch = Array.from(event.touches).find((value) => value.identifier === this.state.edgeId);
        if (!touch) {
            return;
        }
        const deltaX = touch.clientX - this.state.edgeStartX;
        const deltaY = touch.clientY - this.state.edgeStartY;
        if (!this.state.edgeTriggered && this.shouldTrigger(deltaX, deltaY, this.openSign)) {
            this.state.edgeTriggered = true;
            this.setOpen(true);
        }
        if (this.state.edgeTriggered) {
            event.preventDefault();
        }
    };

    private onEdgeTouchEnd = (event: TouchEvent): void => {
        if (this.state.edgeId === null) {
            return;
        }
        const touch = Array.from(event.changedTouches).find((value) => value.identifier === this.state.edgeId);
        if (!touch) {
            return;
        }
        this.state.edgeId = null;
        this.state.edgeTriggered = false;
    };

    private onHolderTouchStart = (event: TouchEvent): void => {
        if (!this.isEnabled() || this.state.holderId !== null) {
            return;
        }
        const touch = event.changedTouches[0];
        if (!touch) {
            return;
        }
        this.state.holderId = touch.identifier;
        this.state.holderTriggered = false;
        this.state.holderStartX = touch.clientX;
        this.state.holderStartY = touch.clientY;
    };

    private onHolderTouchMove = (event: TouchEvent): void => {
        if (!this.isEnabled() || this.state.holderId === null) {
            return;
        }
        const touch = Array.from(event.touches).find((value) => value.identifier === this.state.holderId);
        if (!touch) {
            return;
        }
        const deltaX = touch.clientX - this.state.holderStartX;
        const deltaY = touch.clientY - this.state.holderStartY;
        if (!this.state.holderTriggered && this.shouldTrigger(deltaX, deltaY, -this.openSign)) {
            this.state.holderTriggered = true;
            this.setOpen(false);
        }
        if (this.state.holderTriggered) {
            event.preventDefault();
        }
    };

    private onHolderTouchEnd = (event: TouchEvent): void => {
        if (this.state.holderId === null) {
            return;
        }
        const touch = Array.from(event.changedTouches).find((value) => value.identifier === this.state.holderId);
        if (!touch) {
            return;
        }
        this.state.holderId = null;
        this.state.holderTriggered = false;
    };

    private onDocumentTouchStart = (event: TouchEvent): void => {
        if (!this.isEnabled() || !this.isOpen()) {
            return;
        }
        const target = event.target as Node | null;
        if (target && this.holder.contains(target)) {
            return;
        }
        this.setOpen(false);
    };
}

export interface GoogToolBoxOptions {
    // Start with keyboard capture enabled instead of requiring the user to tick
    // the "Capture keyboard" checkbox first.
    captureKeyboard?: boolean;
    // Side panel housing the former device list features ("More" button).
    deviceMoreBox?: HTMLElement;
}

export class GoogToolBox {
    private readonly rightHolder: HTMLElement;
    private readonly leftHolder: HTMLElement;
    private readonly leftGestureZone: HTMLElement;
    private readonly rightGestureZone: HTMLElement;
    private readonly portraitOrder: ToolBoxElement<any>[];
    private readonly rightOrder: ToolBoxElement<any>[];
    private readonly leftOrder: ToolBoxElement<any>[];
    private readonly mql: MediaQueryList;
    private readonly mobileMql: MediaQueryList;
    private readonly supportsPointer: boolean;
    private readonly leftPanel: EdgePanel;
    private readonly rightPanel: EdgePanel;
    private leftOpen = false;
    private rightOpen = false;

    private constructor(
        portraitOrder: ToolBoxElement<any>[],
        rightOrder: ToolBoxElement<any>[],
        leftOrder: ToolBoxElement<any>[],
    ) {
        this.portraitOrder = portraitOrder;
        this.rightOrder = rightOrder;
        this.leftOrder = leftOrder;
        this.supportsPointer = typeof window.PointerEvent === 'function';

        this.rightHolder = document.createElement('div');
        this.rightHolder.classList.add('control-buttons-list', 'control-buttons-right', 'control-wrapper');

        this.leftHolder = document.createElement('div');
        this.leftHolder.classList.add('control-buttons-list', 'control-buttons-left', 'control-wrapper');

        this.leftGestureZone = document.createElement('div');
        this.leftGestureZone.className = 'left-gesture-zone';

        this.rightGestureZone = document.createElement('div');
        this.rightGestureZone.className = 'right-gesture-zone';

        this.mql = window.matchMedia('(orientation: landscape)');
        this.mobileMql = window.matchMedia('(orientation: portrait) and (max-width: 768px)');
        this.leftPanel = new EdgePanel(
            this.leftGestureZone,
            this.leftHolder,
            this.supportsPointer,
            () => this.isPanelEnabled(),
            () => this.leftOpen,
            (open) => this.setLeftOpen(open),
            1,
        );
        this.rightPanel = new EdgePanel(
            this.rightGestureZone,
            this.rightHolder,
            this.supportsPointer,
            () => this.isPanelEnabled(),
            () => this.rightOpen,
            (open) => this.setRightOpen(open),
            -1,
        );
        this.applyLayout();
        this.mql.addEventListener('change', this.onMediaChange);
        this.mobileMql.addEventListener('change', this.onMediaChange);
        this.leftPanel.bind();
        this.rightPanel.bind();
    }

    public static createToolBox(
        udid: string,
        player: BasePlayer,
        client: StreamClientScrcpy,
        moreBox?: HTMLElement,
        options: GoogToolBoxOptions = {},
    ): GoogToolBox {
        const playerName = player.getName();
        const handler = <K extends keyof HTMLElementEventMap, T extends HTMLElement>(
            type: K,
            element: ToolBoxElement<T>,
        ) => {
            if (!element.optional?.code) {
                return;
            }
            const { code } = element.optional;
            const action = type === 'mousedown' ? KeyEvent.ACTION_DOWN : KeyEvent.ACTION_UP;
            const event = new KeyCodeControlMessage(action, code, 0, 0);
            client.sendMessage(event);
        };

        const leftKeyButtons: ToolBoxElement<any>[] = [];
        const rightKeyButtons: ToolBoxElement<any>[] = [];
        for (const item of BUTTONS) {
            const button = new ToolBoxButton(item.title, item.icon, {
                code: item.code,
            });
            button.addEventListener('mousedown', handler);
            button.addEventListener('mouseup', handler);
            if (item.side === 'left') {
                leftKeyButtons.push(button);
            } else {
                rightKeyButtons.push(button);
            }
        }

        let screenshot: ToolBoxButton | undefined;
        if (player.supportsScreenshot) {
            screenshot = new ToolBoxButton('截图', SvgImage.Icon.CAMERA);
            screenshot.addEventListener('click', () => {
                player.createScreenshot(client.getDeviceName());
            });
        }

        const keyboard = new ToolBoxCheckbox(
            '捕获键盘',
            SvgImage.Icon.KEYBOARD,
            `capture_keyboard_${udid}_${playerName}`,
        );
        keyboard.addEventListener('click', (_, el) => {
            const element = el.getElement();
            client.setHandleKeyboardEvents(element.checked);
        });
        if (options.captureKeyboard) {
            keyboard.getElement().checked = true;
            client.setHandleKeyboardEvents(true);
        }

        const homePage = new ToolBoxButton('返回首页', SvgImage.Icon.ARROW_BACK);
        homePage.getElement().classList.add('home-page-button');
        homePage.addEventListener('click', () => {
            location.href = client.getHomeUrl();
        });

        let settings: ToolBoxButton | undefined;
        if (moreBox) {
            settings = new ToolBoxButton('设置', SvgImage.Icon.SETTINGS);
            settings.getElement().classList.add('panel-toggle');
            settings.addEventListener('click', () => {
                client.toggleSettingsPanel();
            });
            client.registerPanelButton('settings', settings.getElement());
        }

        let more: ToolBoxButton | undefined;
        if (options.deviceMoreBox) {
            more = new ToolBoxButton('更多', SvgImage.Icon.MENU);
            more.getElement().classList.add('panel-toggle');
            more.addEventListener('click', () => {
                client.toggleMorePanel();
            });
            client.registerPanelButton('more', more.getElement());
        }

        const rotate = new ToolBoxButton('全屏横屏', SvgImage.Icon.SCREEN_ROTATION);
        rotate.getElement().classList.add('rotate-toggle');
        rotate.addEventListener('click', () => {
            void client.toggleFullscreenLandscape();
        });
        client.registerRotateButton(rotate.getElement());

        const leftOrder: ToolBoxElement<any>[] = [...leftKeyButtons, ...(screenshot ? [screenshot] : []), keyboard];
        const rightOrder: ToolBoxElement<any>[] = [
            rotate,
            ...(more ? [more] : []),
            ...(settings ? [settings] : []),
            ...rightKeyButtons,
            homePage,
        ];
        const portraitOrder: ToolBoxElement<any>[] = [
            rotate,
            ...(more ? [more] : []),
            ...(settings ? [settings] : []),
            ...leftKeyButtons,
            ...rightKeyButtons,
            ...(screenshot ? [screenshot] : []),
            keyboard,
            homePage,
        ];

        return new GoogToolBox(portraitOrder, rightOrder, leftOrder);
    }

    public getHolderElement(): HTMLElement {
        return this.rightHolder;
    }

    public getLeftHolderElement(): HTMLElement {
        return this.leftHolder;
    }

    public getGestureZoneElement(): HTMLElement {
        return this.leftGestureZone;
    }

    public getRightGestureZoneElement(): HTMLElement {
        return this.rightGestureZone;
    }

    public release(): void {
        this.mql.removeEventListener('change', this.onMediaChange);
        this.mobileMql.removeEventListener('change', this.onMediaChange);
        this.leftPanel.release();
        this.rightPanel.release();
    }

    private static appendElements(holder: HTMLElement, elements: ToolBoxElement<any>[]): void {
        for (const element of elements) {
            for (const el of element.getAllElements()) {
                holder.appendChild(el);
            }
        }
    }

    private isPanelEnabled(): boolean {
        return this.mql.matches || this.mobileMql.matches;
    }

    private applyLayout(): void {
        if (this.isPanelEnabled()) {
            GoogToolBox.appendElements(this.rightHolder, this.rightOrder);
            GoogToolBox.appendElements(this.leftHolder, this.leftOrder);
        } else {
            this.setLeftOpen(false);
            this.setRightOpen(false);
            GoogToolBox.appendElements(this.rightHolder, this.portraitOrder);
        }
    }

    private setLeftOpen(open: boolean): void {
        this.leftOpen = open;
        this.leftHolder.classList.toggle('open', open);
        this.leftGestureZone.classList.toggle('disabled', open);
    }

    private setRightOpen(open: boolean): void {
        this.rightOpen = open;
        this.rightHolder.classList.toggle('open', open);
        this.rightGestureZone.classList.toggle('disabled', open);
    }

    private onMediaChange = (): void => {
        this.applyLayout();
        this.leftPanel.reset();
        this.rightPanel.reset();
    };
}

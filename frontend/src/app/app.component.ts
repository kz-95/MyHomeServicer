import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SnackbarComponent } from './shared/snackbar.component';
import { PinPromptComponent } from './shared/pin-prompt.component';
import { DialogOutletComponent } from './shared/dialog-outlet.component';
import { ChatWidgetComponent } from './shared/chat-widget.component';
import { NotificationPanelComponent } from './shared/notification-panel.component';
import { SiteFooterComponent } from './shared/site-footer.component';
import { StripePaymentService } from './core/services/stripe-payment.service';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, SnackbarComponent, PinPromptComponent, DialogOutletComponent, ChatWidgetComponent, NotificationPanelComponent, SiteFooterComponent],
    template: `
    <router-outlet />
    <app-site-footer />
    <app-snackbar />
    <app-pin-prompt />
    <app-dialog-outlet />
    <app-chat-widget />
    <app-notification-panel />
  `
})
export class AppComponent {
  constructor() {
    inject(StripePaymentService).checkPopupContext();
  }
}

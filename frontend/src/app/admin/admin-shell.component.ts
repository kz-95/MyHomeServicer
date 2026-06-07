import { Component } from "@angular/core";
import { ShellComponent, NavItem } from "../shared/shell.component";

@Component({
  selector: "app-admin-shell",
  imports: [ShellComponent],
  template: `<app-shell portalTitle="Admin" [navItems]="nav" />`,
})
export class AdminShellComponent {
  nav: NavItem[] = [
    { label: "Dashboard", path: "/admin", icon: "bar-chart", exact: true },
    { label: "Accounts", path: "/admin/users", icon: "user" },
    { label: "Review Queues", path: "/admin/queues", icon: "inbox" },
    {
      label: "AI Chat Settings",
      path: "/admin/ai-chat-settings",
      icon: "message-square",
    },
    {
      label: "Financial Settings",
      path: "/admin/money-settings",
      icon: "dollar-sign",
    },
    {
      label: "Category Settings",
      path: "/admin/category-settings",
      icon: "tag",
    },
    { label: "UI/UX Settings", path: "/admin/uiux-settings", icon: "palette" },
    { label: "API Keys", path: "/admin/settings/api-keys", icon: "key-round" },
  ];
}

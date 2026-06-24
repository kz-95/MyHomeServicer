import { Component } from "@angular/core";
import { ShellComponent, NavItem } from "../shared/shell.component";
import { routeFor } from "../core/route-for";

@Component({
  selector: "app-admin-shell",
  imports: [ShellComponent],
  template: `<app-shell portalTitle="Admin" [navItems]="nav" />`,
})
export class AdminShellComponent {
  protected readonly routeFor = routeFor;

  nav: NavItem[] = [
    { label: "Dashboard", path: routeFor('admin'), icon: "bar-chart", exact: true },
    { label: "Accounts", path: routeFor('admin.users'), icon: "user" },
    { label: "Review Queues", path: routeFor('admin.queues'), icon: "inbox" },
    {
      label: "AI Chat Settings",
      path: routeFor('admin.aiChatSettings'),
      icon: "message-square",
    },
    {
      label: "Financial Settings",
      path: routeFor('admin.moneySettings'),
      icon: "dollar-sign",
    },
    {
      label: "Category Settings",
      path: routeFor('admin.categorySettings'),
      icon: "tag",
    },
    { label: "UI/UX Settings", path: routeFor('admin.uiuxSettings'), icon: "palette" },
    { label: "API Keys", path: routeFor('admin.apiKeys'), icon: "key" },
  ];
}

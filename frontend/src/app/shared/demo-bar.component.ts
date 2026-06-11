import { Component, ElementRef, HostListener, inject, isDevMode, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { ConfigService } from '../core/services/config.service';
import { NotificationService } from '../core/services/notification.service';
import { DialogService } from '../core/services/dialog.service';
import { DemoUnlockService } from '../core/services/demo-unlock.service';
import { ModalComponent } from './modal.component';
import { FormsModule } from '@angular/forms';

interface DemoAccount {
  label: string;
  email: string;
}
interface DemoChildGroup {
  name: string;
  accounts: DemoAccount[];
}
interface DemoParentGroup {
  name: string;
  children: DemoChildGroup[];
}

const CUSTOMER_ACCOUNTS: DemoAccount[] = [
  { label: 'Fresh (Sarah Lim)', email: 'customer.fresh@demo.local' },
  { label: 'Fresh 2 (Nurul Hafizah)', email: 'customer.fresh2@demo.local' },
  { label: 'Fresh 3 (Michael Lim)', email: 'customer.fresh3@demo.local' },
  { label: 'Active (David Tan)', email: 'customer.active@demo.local' },
  { label: 'Active 2 (Rashida Kamila)', email: 'customer.active2@demo.local' },
  { label: 'Active 3 (Jason Yeoh)', email: 'customer.active3@demo.local' },
  { label: 'Loyal (Priya Subramaniam)', email: 'customer.loyal@demo.local' },
  { label: 'Loyal 2 (Tan Mei Ling)', email: 'customer.loyal2@demo.local' },
  { label: 'Loyal 3 (Rajan Krishnan)', email: 'customer.loyal3@demo.local' },
];

const SERVICER_GROUPS: DemoParentGroup[] = [
  {
    name: 'Home Maintenance',
    children: [
      { name: 'Plumber', accounts: [
        { label: 'Ahmad Plumbing Services', email: 'servicer.1@demo.local' },
        { label: 'PipePro Plumbing Solutions', email: 'servicer.37@demo.local' },
        { label: 'DrainMaster Plumbing & Sewerage', email: 'servicer.67@demo.local' },
      ]},
      { name: 'Aircond Servicing', accounts: [
        { label: 'CoolBreeze AC Service', email: 'servicer.2@demo.local' },
        { label: 'ArcticAir Services Sdn Bhd', email: 'servicer.38@demo.local' },
        { label: 'PolarCool Aircon Service Centre', email: 'servicer.68@demo.local' },
      ]},
      { name: 'Electrical & Wiring', accounts: [
        { label: 'Volt Masters Electrical', email: 'servicer.3@demo.local' },
        { label: 'PowerLine Electrical Works', email: 'servicer.39@demo.local' },
        { label: 'Ampere Electrical Contractors', email: 'servicer.69@demo.local' },
      ]},
    ],
  },
  {
    name: 'Cleaning Service',
    children: [
      { name: 'Home Cleaning', accounts: [
        { label: 'Sparkle Home Cleaning', email: 'servicer.4@demo.local' },
        { label: 'GlowClean Home Services', email: 'servicer.40@demo.local' },
        { label: 'Bersih Cermat Home Clean', email: 'servicer.70@demo.local' },
      ]},
      { name: 'Sofa & Mattress Cleaning', accounts: [
        { label: 'FreshCare Sofa & Mattress', email: 'servicer.5@demo.local' },
        { label: 'DeepSteam Upholstery Care', email: 'servicer.41@demo.local' },
        { label: 'SofaRenew Cleaning Specialists', email: 'servicer.71@demo.local' },
      ]},
      { name: 'Carpet Cleaning', accounts: [
        { label: 'PureClean Carpet Care', email: 'servicer.6@demo.local' },
        { label: 'FibreFresh Carpet Studio', email: 'servicer.42@demo.local' },
        { label: 'CarpetPro Steam Clean', email: 'servicer.72@demo.local' },
      ]},
      { name: 'Curtain Cleaning', accounts: [
        { label: 'DrapeFresh Curtain Care', email: 'servicer.7@demo.local' },
        { label: 'CleanDrape Curtain Services', email: 'servicer.43@demo.local' },
        { label: 'VelvetClean Curtain & Drape', email: 'servicer.73@demo.local' },
      ]},
    ],
  },
  {
    name: 'Events & Lifestyle',
    children: [
      { name: 'Event Planner', accounts: [
        { label: 'Bliss Wedding & Events', email: 'servicer.8@demo.local' },
        { label: 'Momentous Events Enterprise', email: 'servicer.44@demo.local' },
        { label: 'Premier Occasions Event Co', email: 'servicer.74@demo.local' },
      ]},
      { name: 'Catering', accounts: [
        { label: 'Auntie Mei Catering', email: 'servicer.9@demo.local' },
        { label: 'Warisan Kitchen Catering', email: 'servicer.45@demo.local' },
        { label: 'Lotus Leaf Catering Services', email: 'servicer.75@demo.local' },
      ]},
      { name: 'Professional Organizer', accounts: [
        { label: 'Space Harmony Organizer', email: 'servicer.10@demo.local' },
        { label: 'OrderMind Home Organizing', email: 'servicer.46@demo.local' },
        { label: 'NeatNest Organising Studio', email: 'servicer.76@demo.local' },
      ]},
    ],
  },
  {
    name: 'Home Improvement',
    children: [
      { name: 'Aircond Installation', accounts: [
        { label: 'AC Pro Installers', email: 'servicer.11@demo.local' },
        { label: 'CoolTech Installation Services', email: 'servicer.47@demo.local' },
        { label: 'IceKing AC Installation Works', email: 'servicer.77@demo.local' },
      ]},
      { name: 'Carpentry', accounts: [
        { label: 'Precision Woodworks', email: 'servicer.12@demo.local' },
        { label: 'TimberCraft Furniture Works', email: 'servicer.48@demo.local' },
        { label: 'GrainLine Custom Carpentry', email: 'servicer.78@demo.local' },
      ]},
      { name: 'Renovation', accounts: [
        { label: 'BuildRight Renovation Sdn Bhd', email: 'servicer.13@demo.local' },
        { label: 'HomeCraft Renovation Works', email: 'servicer.49@demo.local' },
        { label: 'AceReno Building & Renovation', email: 'servicer.79@demo.local' },
      ]},
      { name: 'Interior Design', accounts: [
        { label: 'Studio Aria Interior Design Sdn Bhd', email: 'servicer.14@demo.local' },
        { label: 'Lux Interiors Design Studio', email: 'servicer.50@demo.local' },
        { label: 'Aether Design Atelier', email: 'servicer.80@demo.local' },
      ]},
      { name: 'Door & Gate', accounts: [
        { label: 'AutoGate Solutions', email: 'servicer.15@demo.local' },
        { label: 'GateKing Auto & Security', email: 'servicer.51@demo.local' },
        { label: 'IronShield Gate & Grille Works', email: 'servicer.81@demo.local' },
      ]},
      { name: 'Roofing', accounts: [
        { label: 'TopGuard Roofing', email: 'servicer.16@demo.local' },
        { label: 'RoofShield Waterproofing Works', email: 'servicer.52@demo.local' },
        { label: 'ApexRoof Construction Works', email: 'servicer.82@demo.local' },
      ]},
    ],
  },
  {
    name: 'Appliance Repair',
    children: [
      { name: 'Washing Machine Repair', accounts: [
        { label: 'WasherDoc Repair', email: 'servicer.17@demo.local' },
        { label: 'SpinFix Appliance Repair', email: 'servicer.53@demo.local' },
        { label: 'WashTech Appliance Care', email: 'servicer.83@demo.local' },
      ]},
      { name: 'Refrigerator Repair', accounts: [
        { label: 'ChillFix Refrigeration', email: 'servicer.18@demo.local' },
        { label: 'IceBreak Fridge Services', email: 'servicer.54@demo.local' },
        { label: 'FridgePro Cooling Services', email: 'servicer.84@demo.local' },
      ]},
      { name: 'TV Repair', accounts: [
        { label: 'ScreenFix TV Repair', email: 'servicer.19@demo.local' },
        { label: 'PixelPerfect TV Workshop', email: 'servicer.55@demo.local' },
        { label: 'SmartScreen TV & AV Repair', email: 'servicer.85@demo.local' },
      ]},
      { name: 'Oven Repair', accounts: [
        { label: 'HeatWave Oven Repair', email: 'servicer.20@demo.local' },
        { label: 'BakeRight Oven & Kitchen Repair', email: 'servicer.56@demo.local' },
        { label: 'KitchenFix Oven & Appliance', email: 'servicer.86@demo.local' },
      ]},
      { name: 'Water Heater Repair', accounts: [
        { label: 'HydroHeat Services', email: 'servicer.21@demo.local' },
        { label: 'HotFlow Water Systems', email: 'servicer.57@demo.local' },
        { label: 'AquaHeat Plumbing & Heater', email: 'servicer.87@demo.local' },
      ]},
      { name: 'Ceiling Fan Repair', accounts: [
        { label: 'FanFix Services', email: 'servicer.22@demo.local' },
        { label: 'BreezeWorks Fan & Electrical', email: 'servicer.58@demo.local' },
        { label: 'AirSpin Fan & Lighting Works', email: 'servicer.88@demo.local' },
      ]},
      { name: 'Aircond Repair', accounts: [
        { label: 'AC Medic', email: 'servicer.23@demo.local' },
        { label: 'FrostFix AC Repair', email: 'servicer.59@demo.local' },
        { label: 'ChillDoc Aircon Diagnostic', email: 'servicer.89@demo.local' },
      ]},
    ],
  },
  {
    name: 'Education & Training',
    children: [
      { name: 'Art Class', accounts: [
        { label: 'Creative Canvas Studio', email: 'servicer.24@demo.local' },
        { label: 'InkWell Art Academy', email: 'servicer.60@demo.local' },
        { label: 'UrbanBrush Art & Craft Studio', email: 'servicer.90@demo.local' },
      ]},
      { name: 'Language Class', accounts: [
        { label: 'Polyglot Language Academy', email: 'servicer.25@demo.local' },
        { label: 'LinguaEdge Language Centre', email: 'servicer.61@demo.local' },
        { label: 'SpeakEasy Language Hub', email: 'servicer.91@demo.local' },
      ]},
      { name: 'Music Class', accounts: [
        { label: 'Melody Music Studio', email: 'servicer.26@demo.local' },
        { label: 'RhythmBox Music School', email: 'servicer.62@demo.local' },
        { label: 'Nada Music Academy', email: 'servicer.92@demo.local' },
      ]},
      { name: 'Home Tutoring', accounts: [
        { label: 'BrightMinds Tutoring', email: 'servicer.27@demo.local' },
        { label: 'ApexTutor Learning Centre', email: 'servicer.63@demo.local' },
        { label: 'SmartKids Home Tuition', email: 'servicer.93@demo.local' },
      ]},
      { name: 'Cooking Class', accounts: [
        { label: "Chef's Table Cooking Studio", email: 'servicer.28@demo.local' },
        { label: 'SpiceRoute Cooking Academy', email: 'servicer.64@demo.local' },
        { label: 'Chopstick Kitchen Studio', email: 'servicer.94@demo.local' },
      ]},
      { name: 'Gym & Personal Training', accounts: [
        { label: 'FitForge Personal Training', email: 'servicer.29@demo.local' },
        { label: 'CoreStrong Personal Fitness', email: 'servicer.65@demo.local' },
        { label: 'IronWill Fitness Coaching', email: 'servicer.95@demo.local' },
      ]},
      { name: '3D Modeling', accounts: [
        { label: 'FusionCraft Studio (Fusion 360)', email: 'servicer.30@demo.local' },
        { label: 'SketchBuild Studio (SketchUp)', email: 'servicer.31@demo.local' },
        { label: 'BlendForge Studio (Blender)', email: 'servicer.32@demo.local' },
        { label: 'MayaMotion Studio (Maya)', email: 'servicer.33@demo.local' },
        { label: 'MaxDesign Studio (3ds Max)', email: 'servicer.34@demo.local' },
        { label: 'ZBrushArt Studio (ZBrush)', email: 'servicer.35@demo.local' },
      ]},
    ],
  },
  {
    name: 'Technology & Security',
    children: [
      { name: 'Alarm & CCTV', accounts: [
        { label: 'SecureView CCTV & Alarm', email: 'servicer.36@demo.local' },
        { label: 'SafeHaven Security Systems', email: 'servicer.66@demo.local' },
        { label: 'VisionGuard CCTV & Access Control', email: 'servicer.96@demo.local' },
      ]},
    ],
  },
];

@Component({
  selector: 'app-demo-bar',
  standalone: true,
  imports: [FormsModule, ModalComponent],
  template: `
    @if (config.hasDemoData && unlock.unlocked()) {
    <div class="demo-bar">
      <button class="demo-badge" (click)="openUnplug()" title="Unplug from demo">Demo</button>
      <nav class="demo-nav">
        <button class="demo-link" (click)="demoGoHome()">Home</button>
        <div class="demo-dd">
          <button class="demo-link demo-dd-trigger" (click)="toggleDD('customer')" [class.active]="openDD() === 'customer'">
            Customers ▾
          </button>
          @if (openDD() === 'customer') {
            <div class="demo-dd-menu">
              @for (acct of customerAccounts; track acct.email) {
                <button class="demo-dd-item" (click)="demoLoginEmail(acct.email)" [disabled]="demoLoggingIn()">{{ acct.label }}</button>
              }
            </div>
          }
        </div>
        <div class="demo-dd">
          <button class="demo-link demo-dd-trigger" (click)="toggleDD('servicer')" [class.active]="openDD() === 'servicer'">
            Servicers ▾
          </button>
          @if (openDD() === 'servicer') {
            <div class="demo-dd-menu">
              @for (parent of servicerGroups; track parent.name) {
                <div class="demo-dd-parent">{{ parent.name }}</div>
                @for (child of parent.children; track child.name) {
                  <div class="demo-dd-child">{{ child.name }}</div>
                  @for (acct of child.accounts; track acct.email) {
                    <button class="demo-dd-item" (click)="demoLoginEmail(acct.email)" [disabled]="demoLoggingIn()">{{ acct.label }}</button>
                  }
                }
              }
            </div>
          }
        </div>
        <button class="demo-link" (click)="demoLogin('admin')" [disabled]="demoLoggingIn()">{{ demoLoggingIn() ? '…' : 'Admin' }}</button>
      </nav>
      <span class="demo-bar-spacer"></span>
      @if (auth.mode() === 'customer' || auth.principal()?.role === 'customer') {
        <button class="demo-action demo-action--proposal" (click)="seedProposal()" [disabled]="seedingProposal()" title="Generate a demo merchant proposal">
          {{ seedingProposal() ? 'Creating…' : '+ Proposal' }}
        </button>
      }
      <button class="demo-action demo-action--reseed" (click)="confirmReseed.set(true)" title="Reset demo data">↻ Reseed</button>
    </div>

    @if (demoMsg()) {
      <div class="demo-msg-bar">{{ demoMsg() }}</div>
    }

    @if (!config.hasDemoData) {
      @if (demoMsg()) {
        <div class="demo-msg-bar">{{ demoMsg() }}</div>
      }
    }

    <!-- Reseed modal -->
    <app-modal [open]="confirmReseed()" title="Manage demo data" (closed)="confirmReseed.set(false)">
      <p class="muted"><strong>Reset</strong> reloads the original demo data set. Demo accounts keep the same logins.</p>
      <p class="muted"><strong>Clear</strong> removes all content data but keeps demo accounts and services intact.</p>
      @if (reseedError()) { <p class="err">{{ reseedError() }}</p> }
      @if (clearError()) { <p class="err">{{ clearError() }}</p> }
      <div class="modal-actions">
        <button class="btn-ghost" (click)="confirmReseed.set(false)" [disabled]="reseeding() || clearingData()">Cancel</button>
        <button class="btn-reseed" (click)="clearData()" [disabled]="clearingData() || reseeding()">{{ clearingData() ? 'Clearing…' : 'Clear data' }}</button>
        <button class="btn-primary" (click)="reseed()" [disabled]="reseeding() || clearingData()">{{ reseeding() ? 'Reseeding…' : 'Reset demo data' }}</button>
      </div>
    </app-modal>

    <!-- Unplug modal -->
    <app-modal [open]="unplugOpen()" [title]="unplugStep() === 1 ? 'Unplug from demo?' : unplugStep() === 2 ? 'Are you really sure?' : 'Enter admin PIN'" (closed)="closeUnplug()">
      @if (unplugStep() === 1) {
        <p class="muted">This will remove all demo data - bookings, quotes, chat, penalties, and demo accounts. Only categories, settings, and FAQ will be kept.</p>
        <p class="muted">Are you sure you want to continue?</p>
        <div class="modal-actions">
          <button class="btn-ghost" (click)="closeUnplug()">Cancel</button>
          <button class="btn-primary" (click)="unplugStep.set(2)">Yes, continue →</button>
        </div>
      } @else if (unplugStep() === 2) {
        <p class="muted"><strong>This will permanently delete:</strong> all bookings, quote requests, proposals, chat sessions, penalties, reports, promotions, withdrawal requests, and all demo accounts.</p>
        <p class="muted">Only categories, platform settings, and FAQ will be kept. Are you really sure?</p>
        <div class="modal-actions">
          <button class="btn-ghost" (click)="unplugStep.set(1)">← Back</button>
          <button class="btn-primary" (click)="unplugStep.set(3)">Yes, I'm sure →</button>
        </div>
      } @else {
        <p class="muted">Enter the admin PIN to confirm.</p>
        <label class="tu-field">Admin PIN<input type="password" inputmode="numeric" maxlength="8" [(ngModel)]="unplugPin" name="unplugPin" placeholder="····" (keydown.enter)="runUnplug()" /></label>
        @if (unplugError()) { <p class="err">{{ unplugError() }}</p> }
        <div class="modal-actions">
          <button class="btn-ghost" (click)="closeUnplug()" [disabled]="unplugging()">Cancel</button>
          <button class="demo-action demo-action--unplug" style="padding:0.4rem 0.9rem;font-size:0.85rem" (click)="runUnplug()" [disabled]="unplugging() || !unplugPin">{{ unplugging() ? 'Unplugging…' : '⏏ Unplug' }}</button>
        </div>
      }
    </app-modal>
    }
  `,
  styles: [`
    :host { display: contents; }
    .demo-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.1rem 1.25rem;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      height: 28px;
      position: relative;
    }
    .demo-bar::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-warning) 30%, transparent), transparent);
    }
    .demo-badge {
      color: var(--color-warning);
      font-weight: 700;
      letter-spacing: 0.15em;
      font-size: 0.55rem;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: transparent;
      border: none;
      font-family: inherit;
      cursor: pointer;
      padding: 0;
      transition: color 0.2s ease;
    }
    .demo-badge:hover { color: var(--color-muted); }
    .demo-badge::after {
      content: '';
      display: inline-block;
      width: 1px;
      height: 10px;
      background: var(--color-border);
      margin-left: 0.5rem;
    }
    .demo-nav { display: flex; align-items: center; gap: 0.1rem; }
    .demo-link {
      color: var(--color-muted);
      text-decoration: none;
      font-weight: 500;
      padding: 0.08rem 0.5rem;
      border-radius: 3px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      letter-spacing: 0.03em;
      font-size: 0.72rem;
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: inherit;
      line-height: 1.4;
    }
    .demo-link:hover { color: var(--color-text); background: var(--color-bg); }
    .demo-link.active { color: var(--color-warning); }
    .demo-link::after {
      content: '';
      position: absolute;
      bottom: 1px;
      left: 50%;
      width: 0;
      height: 1px;
      background: var(--color-warning);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      transform: translateX(-50%);
    }
    .demo-link:hover::after, .demo-link.active::after { width: 60%; }
    .demo-dd { position: relative; display: inline-flex; }
    .demo-dd-trigger { cursor: pointer; user-select: none; }
    .demo-dd-trigger.active { color: var(--color-warning); }
    .demo-dd-menu {
      position: absolute;
      top: 100%; left: 0;
      margin-top: 2px;
      min-width: 200px;
      max-height: 60vh;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      padding: 0.3rem 0;
      z-index: 100;
      box-shadow: var(--shadow-md);
    }
    .demo-dd-menu::-webkit-scrollbar { width: 8px; }
    .demo-dd-menu::-webkit-scrollbar-thumb { background: var(--color-warning); border-radius: 4px; }
    .demo-dd-parent { color: var(--color-warning); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 0.35rem 0.7rem 0.15rem; opacity: 0.7; border-top: 1px solid var(--color-border); margin-top: 0.2rem; }
    .demo-dd-parent:first-child { border-top: none; margin-top: 0; }
    .demo-dd-child { color: var(--color-muted); font-size: 0.6rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.2rem 0.7rem 0.1rem 1.1rem; }
    .demo-dd-item {
      display: block; width: 100%; text-align: left;
      background: transparent; border: none;
      color: var(--color-text);
      font-size: 0.75rem; font-family: inherit;
      padding: 0.3rem 0.7rem; cursor: pointer;
      transition: all 0.15s ease; white-space: nowrap;
    }
    .demo-dd-item:hover { background: var(--color-bg); color: var(--color-text); }
    .demo-dd-item:disabled { opacity: 0.4; cursor: not-allowed; }
    .demo-bar-spacer { flex: 1; }
    .demo-action {
      font-size: 0.68rem;
      font-weight: 600;
      font-family: inherit;
      padding: 0.12rem 0.6rem;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.2s ease;
      line-height: 1.5;
    }
    .demo-action--proposal { background: var(--color-danger-bg); border: 1px solid var(--color-danger); color: var(--color-danger); }
    .demo-action--proposal:hover { background: var(--color-danger); color: #fff; }
    .demo-action--reseed { background: var(--color-warning-bg); border: 1px solid var(--color-warning); color: var(--color-warning); }
    .demo-action--reseed:hover { background: var(--color-warning); color: #fff; }
    .demo-action--unplug { background: var(--color-promo-bg); border: 1px solid var(--color-promo-border); color: var(--color-promo-text); }
    .demo-action--unplug:hover { background: var(--color-promo); color: #fff; }
    .demo-action:disabled { opacity: 0.45; cursor: not-allowed; }
    .demo-msg-bar {
      font-size: 0.82rem;
      color: var(--color-success);
      padding: 0.15rem 1.25rem;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
    }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .err { color: var(--color-danger); }
    .muted { color: var(--color-muted); }
    .small { font-size: 0.8rem; }
    .btn-reseed { background: var(--color-warning-bg); border: 1px solid var(--color-warning); color: var(--color-text); font-size: 0.85rem; font-weight: 600; padding: 0.4rem 0.7rem; transition: background 0.15s ease; cursor: pointer; }
    .btn-reseed:hover { background: var(--color-warning); color: #fff; }
    .btn-primary { background: var(--gradient-primary); border: none; color: #fff; padding: 0.45rem 1.1rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; }
    .btn-primary:disabled { opacity: 0.5; cursor: default; }
    .btn-ghost { background: none; border: 1px solid var(--color-border); color: var(--color-muted); padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.8rem; cursor: pointer; font-family: inherit; }
    .tu-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; font-weight: 500; margin-top: 0.8rem; }
    .tu-field input { padding: 0.4rem 0.5rem; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.9rem; }
    @media (max-width: 760px) {
      .demo-bar { display: none; }
    }
  `],
})
export class DemoBarComponent {
  isDevMode = isDevMode;
  protected readonly config = inject(ConfigService);
  protected auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private notifications = inject(NotificationService);
  private dialog = inject(DialogService);
  protected readonly unlock = inject(DemoUnlockService);
  private el = inject(ElementRef);

  demoLoggingIn = signal(false);
  openDD = signal<'customer' | 'servicer' | null>(null);

  demoMsg = signal('');

  // Reseed
  confirmReseed = signal(false);
  reseeding = signal(false);
  reseedError = signal('');
  clearingData = signal(false);
  clearError = signal('');

  // Unplug
  unplugOpen = signal(false);
  unplugStep = signal(1);
  unplugPin = '';
  unplugError = signal('');
  unplugging = signal(false);

  // Seed proposal
  seedingProposal = signal(false);

  customerAccounts = CUSTOMER_ACCOUNTS;
  servicerGroups = SERVICER_GROUPS;

  @HostListener('document:click', ['$event'])
  closeDDOnOutsideClick(event: Event): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.openDD.set(null);
    }
  }

  toggleDD(name: 'customer' | 'servicer'): void {
    this.openDD.set(this.openDD() === name ? null : name);
  }

  demoLogin(role: 'customer' | 'servicer' | 'admin'): void {
    if (this.demoLoggingIn()) return;
    this.demoLoggingIn.set(true);
    this.openDD.set(null);
    this.notifications.stop();
    this.auth.logout();
    this.auth.demoLogin(role).subscribe({
      next: () => {
        this.demoLoggingIn.set(false);
        // SPA navigation (NOT window.location.href): the route guard fires the
        // demo PIN gate BEFORE the URL changes, so we never redirect into the
        // portal until the PIN is confirmed.
        this.router.navigate(['/' + role]);
      },
      error: () => { this.demoLoggingIn.set(false); },
    });
  }

  demoLoginEmail(email: string): void {
    if (this.demoLoggingIn()) return;
    this.demoLoggingIn.set(true);
    this.openDD.set(null);
    this.notifications.stop();
    this.auth.logout();
    this.auth.demoLoginByEmail(email).subscribe({
      next: () => {
        this.demoLoggingIn.set(false);
        const role = this.auth.principal()?.role;
        // SPA navigation so the route guard's demo PIN gate runs BEFORE the URL
        // changes - no redirect into the portal until the PIN is confirmed.
        this.router.navigate(['/' + (role ?? '')]);
      },
      error: () => { this.demoLoggingIn.set(false); },
    });
  }

  demoGoHome(): void {
    this.notifications.stop();
    this.auth.logout();
    // Hard reload (not SPA navigate) so the user is ALWAYS fully logged out and
    // every service resets - no stale account state (chat session, notifications,
    // cached principal-derived data) can linger after going Home from the demo bar.
    window.location.href = '/';
  }

  seedProposal(): void {
    this.seedingProposal.set(true);
    this.demoMsg.set('');
    this.api.post<{ category: string; merchant: string; proposedPrice: number }>('/dev/seed-proposal', {}).subscribe({
      next: (r) => {
        this.seedingProposal.set(false);
        this.demoMsg.set(`Demo proposal from ${r.merchant} - RM ${r.proposedPrice} for the ${r.category} quote.`);
        setTimeout(() => this.demoMsg.set(''), 6000);
      },
      error: (e) => {
        this.seedingProposal.set(false);
        this.demoMsg.set(e.message ?? 'Could not create demo proposal');
        setTimeout(() => this.demoMsg.set(''), 6000);
      },
    });
  }

  reseed(): void {
    this.reseeding.set(true);
    this.reseedError.set('');
    this.api.post('/dev/reseed', {}).subscribe({
      next: () => window.location.reload(),
      error: (e) => {
        this.reseeding.set(false);
        this.reseedError.set(e.message ?? 'Reseed failed');
      },
    });
  }

  clearData(): void {
    this.clearingData.set(true);
    this.clearError.set('');
    this.api.post('/dev/clear', {}).subscribe({
      next: () => window.location.reload(),
      error: (e) => {
        this.clearingData.set(false);
        this.clearError.set(e.message ?? 'Clear failed');
      },
    });
  }

  openUnplug(): void {
    this.unplugStep.set(1);
    this.unplugPin = '';
    this.unplugError.set('');
    this.unplugOpen.set(true);
  }

  closeUnplug(): void {
    if (this.unplugging()) return;
    this.unplugOpen.set(false);
  }

  runUnplug(): void {
    if (this.unplugging() || !this.unplugPin) return;
    this.unplugging.set(true);
    this.unplugError.set('');
    this.api.post('/dev/clear-content', { pin: this.unplugPin }).subscribe({
      next: () => { this.auth.logout(); window.location.href = '/?_=${Date.now()}'; },
      error: (e) => {
        this.unplugging.set(false);
        this.unplugError.set(e.error?.message ?? e.message ?? 'Clear failed');
      },
    });
  }
}

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
  { label: 'Fresh (Sarah Lim)', email: 'sarah.lim2@demo.local' },
  { label: 'Fresh 2 (Nurul Hafizah)', email: 'nurul.hafizah@demo.local' },
  { label: 'Fresh 3 (Michael Lim)', email: 'michael.lim@demo.local' },
  { label: 'Active (David Tan)', email: 'david.tan@demo.local' },
  { label: 'Active 2 (Rashida Kamila)', email: 'rashida.kamila@demo.local' },
  { label: 'Active 3 (Jason Yeoh)', email: 'jason.yeoh@demo.local' },
  { label: 'Loyal (Priya Subramaniam)', email: 'priya.subramaniam@demo.local' },
  { label: 'Loyal 2 (Tan Mei Ling)', email: 'tan.mei.ling@demo.local' },
  { label: 'Loyal 3 (Rajan Krishnan)', email: 'rajan.krishnan@demo.local' },
];

const SERVICER_GROUPS: DemoParentGroup[] = [
  {
    name: 'Home Maintenance',
    children: [
      { name: 'Plumber', accounts: [
        { label: 'Ahmad Plumbing Services', email: 'ahmad.bin.ismail@demo.local' },
        { label: 'PipePro Plumbing Solutions', email: 'hairul.azmi@demo.local' },
        { label: 'DrainMaster Plumbing & Sewerage', email: 'suhaimi.ghazali@demo.local' },
      ]},
      { name: 'Aircond Servicing', accounts: [
        { label: 'CoolBreeze AC Service', email: 'kumar.selvam@demo.local' },
        { label: 'ArcticAir Services Sdn Bhd', email: 'lim.boon.kiat@demo.local' },
        { label: 'PolarCool Aircon Service Centre', email: 'wee.chun.hoong@demo.local' },
      ]},
      { name: 'Electrical & Wiring', accounts: [
        { label: 'Volt Masters Electrical', email: 'ravi.chandran@demo.local' },
        { label: 'PowerLine Electrical Works', email: 'selvakumar.pillai@demo.local' },
        { label: 'Ampere Electrical Contractors', email: 'mohan.subramaniam@demo.local' },
      ]},
    ],
  },
  {
    name: 'Cleaning Service',
    children: [
      { name: 'Home Cleaning', accounts: [
        { label: 'Sparkle Home Cleaning', email: 'nurul.aini@demo.local' },
        { label: 'GlowClean Home Services', email: 'rozita.hamid@demo.local' },
        { label: 'Bersih Cermat Home Clean', email: 'salmah.othman@demo.local' },
      ]},
      { name: 'Sofa & Mattress Cleaning', accounts: [
        { label: 'FreshCare Sofa & Mattress', email: 'jason.tan@demo.local' },
        { label: 'DeepSteam Upholstery Care', email: 'teh.wai.choon@demo.local' },
        { label: 'SofaRenew Cleaning Specialists', email: 'raymond.ong@demo.local' },
      ]},
      { name: 'Carpet Cleaning', accounts: [
        { label: 'PureClean Carpet Care', email: 'siti.hajar@demo.local' },
        { label: 'FibreFresh Carpet Studio', email: 'norzahra.idris@demo.local' },
        { label: 'CarpetPro Steam Clean', email: 'shanthi.balakrishnan@demo.local' },
      ]},
      { name: 'Curtain Cleaning', accounts: [
        { label: 'DrapeFresh Curtain Care', email: 'mei.ling@demo.local' },
        { label: 'CleanDrape Curtain Services', email: 'harish.menon@demo.local' },
        { label: 'VelvetClean Curtain & Drape', email: 'noor.aisyah.ramli@demo.local' },
      ]},
    ],
  },
  {
    name: 'Events & Lifestyle',
    children: [
      { name: 'Event Planner', accounts: [
        { label: 'Bliss Wedding & Events', email: 'grace.wong@demo.local' },
        { label: 'Momentous Events Enterprise', email: 'sharifah.nadia@demo.local' },
        { label: 'Premier Occasions Event Co', email: 'derrick.lau@demo.local' },
      ]},
      { name: 'Catering', accounts: [
        { label: 'Auntie Mei Catering', email: 'mei.ling2@demo.local' },
        { label: 'Warisan Kitchen Catering', email: 'puan.rohani.bakar@demo.local' },
        { label: 'Lotus Leaf Catering Services', email: 'kavitha.suppiah@demo.local' },
      ]},
      { name: 'Professional Organizer', accounts: [
        { label: 'Space Harmony Organizer', email: 'priya.devi@demo.local' },
        { label: 'OrderMind Home Organizing', email: 'cindy.yap@demo.local' },
        { label: 'NeatNest Organising Studio', email: 'lim.jia.hui@demo.local' },
      ]},
    ],
  },
  {
    name: 'Home Improvement',
    children: [
      { name: 'Aircond Installation', accounts: [
        { label: 'AC Pro Installers', email: 'kenny.wong@demo.local' },
        { label: 'CoolTech Installation Services', email: 'zulkifli.nordin@demo.local' },
        { label: 'IceKing AC Installation Works', email: 'roslan.taib@demo.local' },
      ]},
      { name: 'Carpentry', accounts: [
        { label: 'Precision Woodworks', email: 'lim.kok.wah@demo.local' },
        { label: 'TimberCraft Furniture Works', email: 'chong.yen.kee@demo.local' },
        { label: 'GrainLine Custom Carpentry', email: 'foo.chee.wah@demo.local' },
      ]},
      { name: 'Renovation', accounts: [
        { label: 'BuildRight Renovation Sdn Bhd', email: 'buildright.group@demo.local' },
        { label: 'HomeCraft Renovation Works', email: 'nizam.azlan@demo.local' },
        { label: 'AceReno Building & Renovation', email: 'adzrul.hafiz@demo.local' },
      ]},
      { name: 'Interior Design', accounts: [
        { label: 'Studio Aria Interior Design Sdn Bhd', email: 'studio.aria@demo.local' },
        { label: 'Lux Interiors Design Studio', email: 'vivian.leong@demo.local' },
        { label: 'Aether Design Atelier', email: 'anastasia.lim@demo.local' },
      ]},
      { name: 'Door & Gate', accounts: [
        { label: 'AutoGate Solutions', email: 'ah.chong@demo.local' },
        { label: 'GateKing Auto & Security', email: 'mohd.fauzi.ariffin@demo.local' },
        { label: 'IronShield Gate & Grille Works', email: 'shahril.amin@demo.local' },
      ]},
      { name: 'Roofing', accounts: [
        { label: 'TopGuard Roofing', email: 'hassan.abdullah@demo.local' },
        { label: 'RoofShield Waterproofing Works', email: 'kasim.wahab@demo.local' },
        { label: 'ApexRoof Construction Works', email: 'balachandran.pillai@demo.local' },
      ]},
    ],
  },
  {
    name: 'Appliance Repair',
    children: [
      { name: 'Washing Machine Repair', accounts: [
        { label: 'WasherDoc Repair', email: 'rajesh.kumar@demo.local' },
        { label: 'SpinFix Appliance Repair', email: 'kumaresan.velu@demo.local' },
        { label: 'WashTech Appliance Care', email: 'ooi.boon.huat@demo.local' },
      ]},
      { name: 'Refrigerator Repair', accounts: [
        { label: 'ChillFix Refrigeration', email: 'chen.wei@demo.local' },
        { label: 'IceBreak Fridge Services', email: 'tan.ah.kow@demo.local' },
        { label: 'FridgePro Cooling Services', email: 'nor.azlina.musa@demo.local' },
      ]},
      { name: 'TV Repair', accounts: [
        { label: 'ScreenFix TV Repair', email: 'alex.tan@demo.local' },
        { label: 'PixelPerfect TV Workshop', email: 'indra.babu@demo.local' },
        { label: 'SmartScreen TV & AV Repair', email: 'sivakumar.rajan@demo.local' },
      ]},
      { name: 'Oven Repair', accounts: [
        { label: 'HeatWave Oven Repair', email: 'fatimah.ismail@demo.local' },
        { label: 'BakeRight Oven & Kitchen Repair', email: 'zakaria.hamdan@demo.local' },
        { label: 'KitchenFix Oven & Appliance', email: 'juliana.mohd.zain@demo.local' },
      ]},
      { name: 'Water Heater Repair', accounts: [
        { label: 'HydroHeat Services', email: 'shankar.nathan@demo.local' },
        { label: 'HotFlow Water Systems', email: 'murugaiah.arumugam@demo.local' },
        { label: 'AquaHeat Plumbing & Heater', email: 'remy.haziq@demo.local' },
      ]},
      { name: 'Ceiling Fan Repair', accounts: [
        { label: 'FanFix Services', email: 'danny.ooi@demo.local' },
        { label: 'BreezeWorks Fan & Electrical', email: 'ang.khim.seng@demo.local' },
        { label: 'AirSpin Fan & Lighting Works', email: 'krishnan.nair@demo.local' },
      ]},
      { name: 'Aircond Repair', accounts: [
        { label: 'AC Medic', email: 'faizal.rahman@demo.local' },
        { label: 'FrostFix AC Repair', email: 'ridzuan.salleh@demo.local' },
        { label: 'ChillDoc Aircon Diagnostic', email: 'syafiq.azman@demo.local' },
      ]},
    ],
  },
  {
    name: 'Education & Training',
    children: [
      { name: 'Art Class', accounts: [
        { label: 'Creative Canvas Studio', email: 'sarah.lim@demo.local' },
        { label: 'InkWell Art Academy', email: 'yew.siau.lin@demo.local' },
        { label: 'UrbanBrush Art & Craft Studio', email: 'amelia.fong@demo.local' },
      ]},
      { name: 'Language Class', accounts: [
        { label: 'Polyglot Language Academy', email: 'joseph.fernandez@demo.local' },
        { label: 'LinguaEdge Language Centre', email: 'azri.hamidon@demo.local' },
        { label: 'SpeakEasy Language Hub', email: 'ong.siew.ching@demo.local' },
      ]},
      { name: 'Music Class', accounts: [
        { label: 'Melody Music Studio', email: 'michelle.tan@demo.local' },
        { label: 'RhythmBox Music School', email: 'prabhakaran.suresh@demo.local' },
        { label: 'Nada Music Academy', email: 'tengku.amirul@demo.local' },
      ]},
      { name: 'Home Tutoring', accounts: [
        { label: 'BrightMinds Tutoring', email: 'aminah.yusof@demo.local' },
        { label: 'ApexTutor Learning Centre', email: 'chong.mei.fong@demo.local' },
        { label: 'SmartKids Home Tuition', email: 'nurul.ain.zahari@demo.local' },
      ]},
      { name: 'Cooking Class', accounts: [
        { label: "Chef's Table Cooking Studio", email: 'chef.rahman@demo.local' },
        { label: 'SpiceRoute Cooking Academy', email: 'ganesh.krishnamurthy@demo.local' },
        { label: 'Chopstick Kitchen Studio', email: 'ho.lai.yee@demo.local' },
      ]},
      { name: 'Gym & Personal Training', accounts: [
        { label: 'FitForge Personal Training', email: 'adam.malik@demo.local' },
        { label: 'CoreStrong Personal Fitness', email: 'farah.diyana@demo.local' },
        { label: 'IronWill Fitness Coaching', email: 'hardeep.singh@demo.local' },
      ]},
      { name: '3D Modeling', accounts: [
        { label: 'FusionCraft Studio (Fusion 360)', email: 'arvind.nair@demo.local' },
        { label: 'SketchBuild Studio (SketchUp)', email: 'lee.chen@demo.local' },
        { label: 'BlendForge Studio (Blender)', email: 'maya.putri@demo.local' },
        { label: 'MayaMotion Studio (Maya)', email: 'kevin.raj@demo.local' },
        { label: 'MaxDesign Studio (3ds Max)', email: 'desmond.ng@demo.local' },
        { label: 'ZBrushArt Studio (ZBrush)', email: 'aina.zahra@demo.local' },
      ]},
    ],
  },
  {
    name: 'Technology & Security',
    children: [
      { name: 'Alarm & CCTV', accounts: [
        { label: 'SecureView CCTV & Alarm', email: 'ahmed.rahim@demo.local' },
        { label: 'SafeHaven Security Systems', email: 'patrick.chin@demo.local' },
        { label: 'VisionGuard CCTV & Access Control', email: 'marcus.yong@demo.local' },
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

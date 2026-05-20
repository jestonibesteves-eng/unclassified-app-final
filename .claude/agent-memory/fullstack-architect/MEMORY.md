# DAR RO V HRIS — Agent Memory

## Project
Laravel 11.x HRIS for Department of Agrarian Reform Regional Office V (Bicol Region).
Working directory: `C:/Users/Jestoni Esteves/claude/hris`

## Stack (Phase 2 Target)
- PHP 8.2.12, Laravel 11.x, MariaDB 10.4.32 (XAMPP)
- Tailwind CSS v3 (already in package.json), DaisyUI, Alpine.js, Livewire v3
- Vite for asset bundling

## Phase 1: COMPLETE
Custom auth, system_users table, 11 roles, audit logs, lockout logic. See project MEMORY.md for full detail.

## Frontend Migration: Bootstrap 5 → TALL Stack
- Tailwind v3 already installed (tailwind.config.js exists)
- DaisyUI not yet installed as of 2026-02-25 — guide written for developer
- Alpine.js not yet installed as of 2026-02-25
- Livewire v3 not yet installed as of 2026-02-25
- Guide saved at: `docs/tall-stack-guide.md`

## Key File Paths
- `tailwind.config.js` — needs DaisyUI plugin + app/Livewire/**/*.php in content array
- `resources/css/app.css` — already has @tailwind directives
- `resources/js/app.js` — needs Alpine import after npm install alpinejs
- `resources/views/layouts/` — needs @livewireStyles / @livewireScripts after composer install

## Conventions Established
- DaisyUI theme: `data-theme="light"` on `<html>` tag
- Livewire components go in `app/Livewire/`
- Prefer `wire:model.live` for search/date inputs, plain `wire:model` for normal inputs
- Use Alpine.js for purely visual interactions, Livewire for anything needing PHP/DB

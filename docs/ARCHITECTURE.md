# Discourse User Status Theme Component Architecture

This document describes how the theme component is built, which Discourse APIs it uses, and which areas deserve special attention during a Discourse code review.

## Purpose

The component extends Discourse's built-in user status feature with:

- a custom status modal shared across all known status entry points
- configurable quick-select presets
- an optional local browser history for frequently used statuses
- an avatar placeholder button for users who do not currently have a status
- accessibility improvements around emoji rendering, keyboard interaction, and button labels

The component depends on Discourse's core user status feature. The site setting `enable_user_status` must be enabled on the Discourse instance; otherwise the core `/user-status.json` endpoint is not available and saving a status will fail.

## Repository Layout

```text
about.json
settings.yml
common/common.scss
locales/de.yml
locales/en.yml
javascripts/discourse/initializers/user-status-overlay.js
javascripts/discourse/components/modal/user-status-custom-modal.js
javascripts/discourse/components/modal/user-status-custom-modal.hbs
docs/ARCHITECTURE.md
```

## Theme Metadata

`about.json` declares the package as a Discourse theme component:

- `component: true`
- `theme_version: 1.1.0`
- `minimum_discourse_version: 3.3.0`

The component was tested against a modern component-based Discourse frontend. The modal override relies on current modal-service behavior and should be rechecked after major Discourse frontend upgrades.

## Settings

`settings.yml` defines the component's admin-facing configuration.

### `enable_status_history`

Type: `bool`

Default: `true`

Controls whether the custom modal reads from and writes to `localStorage` under the key `user_status_history`. When disabled, the "Frequently used" section is hidden and no status history is persisted in the browser.

### `status_presets`

Type: `objects`

Each preset has:

- `emoji`: the Discourse emoji identifier without surrounding colons
- `name`: the visible status text

The modal first reads this structured object setting. A legacy string parser is still present as a fallback for older configurations, but the intended admin UI is the object-based setting.

## Localization

Localized strings live in:

- `locales/de.yml`
- `locales/en.yml`

Templates use `theme-i18n` or `theme-prefix` for theme-specific translations. JavaScript uses Discourse's injected `themePrefix` helper through a small fallback wrapper in `user-status-custom-modal.js` and `user-status-overlay.js`.

Core Discourse translation keys are still used where the component intentionally mirrors the native user status modal, for example:

- `user_status.set_custom_status`
- `user_status.pause_notifications`
- `user_status.remove_status`
- `user_status.save`

## Modal Architecture

The custom modal consists of:

- `javascripts/discourse/components/modal/user-status-custom-modal.js`
- `javascripts/discourse/components/modal/user-status-custom-modal.hbs`

It is a Glimmer component that receives a modal `@model` compatible with Discourse's native user status modal. The expected model shape is:

```js
{
  status,
  pauseNotifications,
  hidePauseNotifications,
  saveAction,
  deleteAction
}
```

`saveAction` and `deleteAction` are intentionally honored when present. This is important because different Discourse entry points use the user status modal differently:

- header/user-menu flows usually persist immediately through the core `user-status` service
- preferences/account flows may only update the page controller draft and persist later when the user saves account preferences

The component keeps the status object in a `trackedObject`, because `UserStatusPicker` mutates the passed status object directly.

### Save Flow

The save button calls `saveStatus()`:

1. Validate that the description is not longer than 30 characters.
2. Save the status to local history if `enable_status_history` is active.
3. Build a Discourse-compatible status payload:

   ```js
   {
     description,
     emoji,
     ends_at
   }
   ```

4. Prefer `this.args.model.saveAction(newStatus, pauseNotifications)` when provided.
5. Fall back to Discourse's `service:user-status#set` only when no `saveAction` exists.
6. Close the modal on success.
7. Display AJAX errors via `popupAjaxError`.

The core `service:user-status` persists through Discourse's `/user-status.json` endpoint. This endpoint exists only when the core user status feature is enabled.

### Delete Flow

The delete button calls `deleteStatus()`:

1. Prefer `this.args.model.deleteAction()`.
2. Fall back to `service:user-status#clear`.
3. Close the modal on success.
4. Display AJAX errors via `popupAjaxError`.

### Presets

The modal's preset list comes from `settings.status_presets`. Each preset button:

- sets `status.emoji`
- sets `status.description`
- hides the emoji from assistive technology with `aria-hidden="true"`
- exposes the preset name as the button's accessible label

The built-in fallback list exists so the modal remains usable if the admin setting is empty or malformed.

### Status History

When enabled, history is stored in `localStorage` as `user_status_history`.

The stored objects have this shape:

```js
{
  emoji,
  name,
  count
}
```

Only the top three entries by usage count are displayed. The history is intentionally browser-local and not sent to Discourse.

Review note: status text can contain sensitive information such as illness or absence. Keeping this feature configurable is intentional.

### Time Selection

The modal offers:

- inline shortcuts based on Discourse's `timeShortcuts`
- a native `datetime-local` picker for custom end times

The custom date input stores a JavaScript `Date` on `status.endsAt`. The save flow serializes it to ISO format as `ends_at`.

## Modal Redirection

`javascripts/discourse/initializers/user-status-overlay.js` is responsible for routing native user-status modal calls to the custom modal.

It patches the singleton `service:modal#show` instance because earlier attempts to override only by component class were not reliable when multiple theme components were active.

The wrapper redirects only calls that look like Discourse's user status modal:

- the first argument is `"user-status"`
- the first argument matches the core user status modal class
- the first argument has the expected `UserStatusModal` class name
- the modal call includes a model with `status`, `saveAction`, and `deleteAction`

When redirecting, legacy modal options such as `title` and `modalClass` are stripped, because Discourse's component-based modal API does not accept them.

The wrapper is guarded by `__discoursestatusUserStatusShowWrapped` so it is applied only once. It also catches errors and falls back to the original modal call to avoid breaking unrelated modals.

Review note: this is the most update-sensitive part of the component. It should be retested after Discourse changes to `service:modal`, `components/modal/user-status`, or the modal invocation model.

## Avatar Placeholder

The same initializer adds a small `+` placeholder over the current user's header avatar when the user has no status.

The placeholder:

- is inserted into the current-user header button DOM
- has `role="button"`
- has `tabindex="0"`
- has an accessible label from `placeholder.set_status`
- opens the custom modal on click, Enter, or Space
- is sized at 24 x 24 pixels
- uses a visible focus style

The placeholder uses manual DOM positioning because the exact header/avatar markup differs between Discourse versions and active themes. The code updates the computed `left` and `top` values after insertion and again after short delays to account for image loading.

Review note: this is DOM-level integration rather than a plugin outlet. It is intentionally narrow, but it should be tested with the target header theme and after Discourse header changes.

## Styling

`common/common.scss` contains all visual styling.

Main sections:

- avatar placeholder positioning and focus state
- modal layout, grids, buttons, and time picker

The component uses Discourse CSS variables such as:

- `var(--primary)`
- `var(--primary-low)`
- `var(--primary-low-mid)`
- `var(--secondary)`
- `var(--tertiary)`

The placeholder color was changed from the CSS keyword `darkgreen` to `#1b5e20` for better contrast against `#e0e0e0`.

The placeholder animation respects `prefers-reduced-motion`.

## Accessibility

Accessibility-related behavior includes:

- preset and history emojis are wrapped in `aria-hidden="true"`
- preset and history buttons expose text labels
- the avatar placeholder has role, tabindex, keyboard handling, and a visible focus state
- the native datetime input has a label and `aria-label`
- the delete button has an accessible label

Recommended manual checks:

- open the status modal with keyboard only
- select a preset with keyboard only
- save and delete a status with keyboard only
- confirm a screen reader announces preset names without reading emoji descriptions

## Security and Privacy Notes

### Local Storage

The status history is stored in browser `localStorage`. This is same-origin readable by scripts running on the Discourse site. Because status text may be sensitive, the feature is controlled by `enable_status_history`.

### Permissions

The component uses Discourse's existing endpoints and services. It does not introduce a server-side endpoint and does not bypass Discourse authorization.

### Modal Monkeypatch

The modal-service wrapper is intentionally narrow and guarded, but it is still a compatibility risk. The code review should verify that:

- unrelated modals still open normally
- legacy modal options are stripped only for redirected user-status modal calls
- the wrapper is not applied multiple times
- errors inside the wrapper fall back to native modal behavior

## Runtime Requirements

The Discourse instance must have:

- core user status enabled (`enable_user_status`)
- access to `/user-status.json` for the current user

If saving reports "requested URL or resource could not be found", first verify `enable_user_status`. A disabled core user status feature removes the `/user-status.json` route and causes a 404 during save.

## Manual Review Checklist

After installing or updating the component:

1. Hard-refresh the browser to clear compiled theme assets.
2. Confirm that the avatar placeholder opens the custom modal.
3. Confirm that the user menu/status entry opens the same custom modal.
4. Confirm that the account preferences status entry still follows Discourse's expected draft/save behavior.
5. Save a preset status and verify it appears immediately in the header.
6. Save a custom status with an end time and verify `ends_at` behavior.
7. Delete an existing status.
8. Toggle `enable_status_history` off and verify no history is shown or written.
9. Test keyboard navigation and screen reader labels.
10. Test unrelated Discourse modals to ensure the modal-service wrapper does not interfere.

## Known Maintenance Risks

The largest long-term risk is the modal-service wrapper in `user-status-overlay.js`. It exists to enforce a single custom user status modal across different Discourse entry points, but it depends on internal modal invocation patterns.

The second risk is the DOM-level avatar placeholder integration. It is intentionally scoped to header current-user selectors, but header markup can change between Discourse versions and themes.

For future refactoring, prefer official Discourse plugin outlets or a supported component replacement API if one becomes available for the user status modal and header avatar status affordance.

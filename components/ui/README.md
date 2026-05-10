# UI Components

Primitive design system components for conduit-app. All components are black-and-white only — read the colour rules in [`CONTRIBUTING.md`](../../CONTRIBUTING.md#design-system) before modifying.

---

## Button

```tsx
import { Button } from '@/components/ui/Button';

<Button variant="primary" onClick={...}>Create stream</Button>
<Button variant="secondary" href="/streams">View streams</Button>
<Button variant="ghost" loading={isPending}>Withdraw</Button>
<Button variant="primary" disabled>Not available</Button>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Padding and font size |
| `loading` | `boolean` | `false` | Show spinner, disable interaction |
| `disabled` | `boolean` | `false` | Greyed out, non-interactive |
| `href` | `string` | — | Renders as `<Link>` instead of `<button>` |
| `fullWidth` | `boolean` | `false` | `w-full` |

### Variants

| Variant | Background | Text | Border | Use for |
|---------|-----------|------|--------|---------|
| `primary` | `bg-black` | `text-white` | none | Main CTA |
| `secondary` | `bg-white` | `text-black` | `border border-black` | Secondary action |
| `ghost` | transparent | `text-black` | none | Tertiary / destructive |

---

## Card

```tsx
import { Card } from '@/components/ui/Card';

<Card>
  <p>Content here</p>
</Card>

<Card className="p-6">
  <p>Custom padding</p>
</Card>
```

A `<div>` with `border border-gray-100 p-4` applied. Pass `className` to override padding or add hover states.

For clickable cards, use a `<Link>` wrapping a `<Card>`:

```tsx
<Link href={`/stream/${id}`}>
  <Card className="hover:border-black transition-colors">
    ...
  </Card>
</Link>
```

---

## Input

```tsx
import { Input } from '@/components/ui/Input';

<Input
  label="Recipient address"
  placeholder="G..."
  value={address}
  onChange={e => setAddress(e.target.value)}
  error={errors.address?.message}
/>

<Input
  label="Amount"
  type="number"
  hint="In display units (e.g. 100.5)"
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Label text above the input |
| `hint` | `string` | Grey helper text below the input |
| `error` | `string` | Red-bordered error state with message |
| `type` | `string` | HTML input type; default `'text'` |

All other props forwarded to the underlying `<input>`.

---

## Badge

```tsx
import { Badge } from '@/components/ui/Badge';

<Badge status="active" />
<Badge status="paused" />
<Badge status="ended" />
<Badge status="cancelled" />
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `status` | `'active' \| 'paused' \| 'ended' \| 'cancelled'` | Controls label and style |

Badges use `border` and `text-gray-*` shades only — no colour.

| Status | Label | Style |
|--------|-------|-------|
| `active` | Active | `border-black text-black` |
| `paused` | Paused | `border-gray-400 text-gray-400` |
| `ended` | Ended | `border-gray-300 text-gray-300` |
| `cancelled` | Cancelled | `border-gray-200 text-gray-300 line-through` |

---

## ProgressBar

```tsx
import { ProgressBar } from '@/components/ui/ProgressBar';

<ProgressBar value={0.42} />           // 42% filled
<ProgressBar value={1} />              // fully drained
<ProgressBar value={0} label="0%" />   // with label override
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | required | `0`–`1` fraction elapsed |
| `label` | `string` | auto | Override the percentage label |

Renders as a `bg-gray-100` track with a `bg-black` fill. At 100%, fill turns `bg-gray-300` to indicate the stream is fully drained.

---

## Modal

```tsx
import { Modal } from '@/components/ui/Modal';

<Modal open={isOpen} onClose={() => setIsOpen(false)} title="Top up stream">
  <p>Enter an amount to add to the stream.</p>
  <Input label="Amount" ... />
  <div className="flex gap-2 mt-4">
    <Button variant="primary" onClick={handleTopUp}>Confirm</Button>
    <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
  </div>
</Modal>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Controls visibility |
| `onClose` | `() => void` | Called on backdrop click or Escape key |
| `title` | `string` | Modal heading |
| `children` | `ReactNode` | Modal body |

The modal is a portal rendered into `document.body`. It traps focus while open and restores focus on close.

---

## Adding new components

Before adding a new primitive component:

1. Check that it cannot be composed from existing primitives.
2. Keep it stateless and generic — no business logic, no Soroban calls.
3. Use only black/white/gray colour utilities.
4. Export it as a named export from the component file (not default export).
5. Document it in this README following the same format.
6. Add it to `components/ui/index.ts` for barrel imports.

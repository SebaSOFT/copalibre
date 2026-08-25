# Third-party notices

CopaLibre is AGPL-3.0-only. Components copied into this repository keep their
original licence and notice; this file records what was copied, from where, and
at what version.

Copied rather than depended on because the control app owns its interaction
surface: a UI dependency that changes behaviour in a minor release changes an
operator's console mid-tournament. Owning the file makes an upgrade a decision.

## `apps/web/src/control/components/ui/`

Reorganized into `atoms/`, `molecules/`, `organisms/`, `templates/` (0141); a
copied-source entry below names the file, not its subfolder, so it still
matches wherever the file lives.

| File           | Source                             | Version | Licence |
| -------------- | ----------------------------------- | ------- | ------- |
| `button.tsx`   | shadcn/ui `button`                  | 2.3.0   | MIT     |
| `card.tsx`     | shadcn/ui `card`                    | 2.3.0   | MIT     |
| `badge.tsx`    | shadcn/ui `badge`                   | 2.3.0   | MIT     |
| `input.tsx`    | shadcn/ui `input`                   | 2.3.0   | MIT     |
| `textarea.tsx` | shadcn/ui `textarea`                | 2.3.0   | MIT     |
| `select.tsx`   | shadcn/ui `select` on Radix Select  | 2.3.0   | MIT     |
| `checkbox.tsx` | shadcn/ui `checkbox` on Radix Checkbox | 2.3.0 | MIT   |
| `label.tsx`    | shadcn/ui `label` on Radix Label    | 2.3.0   | MIT     |
| `modal.tsx`    | shadcn/ui `dialog` on Radix Dialog  | 2.3.0   | MIT     |

### MIT License (shadcn/ui)

```
Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

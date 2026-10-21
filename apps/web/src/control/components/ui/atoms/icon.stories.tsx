import type { Meta, StoryObj } from '@storybook/react-vite';
import { Fragment } from 'react';
import { Icon } from './icon.js';
import { ICON_REGISTRY, type IconName } from '../../../../lib/icon-registry.js';

const meta = {
  title: 'Admin/Iconography',
  component: Icon,
  args: { name: 'clock', size: 20 },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

const names = Object.keys(ICON_REGISTRY) as IconName[];

export const RegistryAtEverySize: Story = {
  render: () => (
    <div className="cl-iconography">
      <div className="cl-iconography__grid">
        <span />
        {[16, 20, 24].map((size) => (
          <strong key={size}>{size}px</strong>
        ))}
        {names.map((name) => (
          <Fragment key={name}>
            <code>{name}</code>
            {[16, 20, 24].map((size) => (
              <Icon key={size} name={name} size={size as 16 | 20 | 24} />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="cl-iconography__overlay" aria-label="Lucide and Tabler optical comparison">
        <span>
          <Icon name="clock" size={24} />
        </span>
        <span>
          <Icon name="football" size={24} />
        </span>
        <small>Lucide / Tabler · 1.1×</small>
      </div>
      <style>{`
        .cl-iconography { display:grid; gap:var(--cl-space-6); padding:var(--cl-space-6); color:var(--cl-text-primary); background:var(--cl-color-ink-950); }
        .cl-iconography__grid { display:grid; grid-template-columns:minmax(120px,1fr) repeat(3,48px); gap:var(--cl-space-2); align-items:center; }
        .cl-iconography__grid strong,.cl-iconography__grid code { color:var(--cl-text-secondary); font-family:var(--cl-font-mono); font-size:var(--cl-font-size-xs); }
        .cl-iconography__grid svg { justify-self:center; }
        .cl-iconography__overlay { display:flex; align-items:center; gap:var(--cl-space-5); }
        .cl-iconography__overlay span { display:grid; place-items:center; width:120px; height:120px; border:1px solid var(--cl-border-strong); }
        .cl-iconography__overlay svg { width:120px; height:120px; transform:scale(5); }
        .cl-iconography__overlay svg.cl-icon--tabler { transform:scale(5.5); }
      `}</style>
    </div>
  ),
};

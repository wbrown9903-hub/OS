"use client";

import type { PropertyDefinition } from "@nexus/schemas";
import { ActionControl, ConnectionControl, LinkControl } from "./action-controls";
import {
  DurationControl,
  FontControl,
  IconControl,
  LongTextControl,
  MultiSelectControl,
  NumberControl,
  SelectControl,
  ShortcutControl,
  SliderControl,
  TextControl,
  ToggleControl,
  UrlControl,
} from "./basic-controls";
import { ListControl } from "./ListControl";
import { AudioControl, ColorControl, ImageControl } from "./media-controls";
import type { ControlProps } from "./common";

/**
 * The one place a property kind is turned into a control.
 *
 * The switch is exhaustive over `PropertyKind`: adding a kind to
 * `packages/schemas/src/property.ts` makes this file fail to compile until a
 * control exists for it. Adding a *widget* changes nothing here at all — which
 * is the entire point of the property schema.
 */
export function PropertyControl(props: ControlProps) {
  const { definition } = props;

  switch (definition.kind) {
    case "text":
      return <TextControl {...props} />;
    case "longText":
      return <LongTextControl {...props} />;
    case "number":
      return <NumberControl {...props} />;
    case "toggle":
      return <ToggleControl {...props} />;
    case "select":
      return <SelectControl {...props} />;
    case "multiSelect":
      return <MultiSelectControl {...props} />;
    case "color":
      return <ColorControl {...props} />;
    case "image":
      return <ImageControl {...props} />;
    case "audio":
      return <AudioControl {...props} />;
    case "url":
      return <UrlControl {...props} />;
    case "link":
      return <LinkControl {...props} />;
    case "action":
      return <ActionControl {...props} />;
    case "shortcut":
      return <ShortcutControl {...props} />;
    case "duration":
      return <DurationControl {...props} />;
    case "slider":
      return <SliderControl {...props} />;
    case "font":
      return <FontControl {...props} />;
    case "icon":
      return <IconControl {...props} />;
    case "connection":
      return <ConnectionControl {...props} />;
    case "list":
      return (
        <ListControl
          {...props}
          renderProperty={(nested: {
            id: string;
            definition: PropertyDefinition;
            value: unknown;
            onChange: (next: unknown) => void;
          }) => <PropertyControl {...nested} />}
        />
      );
  }
}

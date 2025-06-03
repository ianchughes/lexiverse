
"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

// Define props for our custom Checkbox, including an optional indeterminate prop
interface CustomCheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  // Keep all original props of CheckboxPrimitive.Root (including its `checked` prop which is `boolean | 'indeterminate'`)
  // And add our own boolean `indeterminate` prop for convenience.
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CustomCheckboxProps
>(({ className, checked, indeterminate, ...restProps }, ref) => { // Destructure indeterminate, it won't be in restProps
  // Determine the state for Radix Primitive
  // If our component's `indeterminate` prop is true, then Radix's `checked` state should be 'indeterminate'.
  // Otherwise, Radix's `checked` state is whatever our component's `checked` prop is (true or false).
  const radixCheckedState = indeterminate ? 'indeterminate' : checked;

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={radixCheckedState} // Pass the transformed state
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className
      )}
      {...restProps} // Spread other props like onCheckedChange, disabled, etc. `indeterminate` is not spread.
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
      >
        {/* Radix's Checkbox.Indicator is typically not rendered when state is 'indeterminate'.
            If a custom indicator for indeterminate state is desired, it could be handled here or via CSS.
            For now, the Check icon is standard for the 'checked' state.
        */}
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }

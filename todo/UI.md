## Layouts, Buttons and Alignment

As you can see in the attached images the entire layout remains garbled and unusable especially the "cookie tools" tab. Essentially the window itself is just too narrow. Analyze the images for the conflicts and make the adjustments accordingly for proper flex, padding, alignment and layout. 

## Inspiration

In addition to the 4 screenshots of the extension after your modifications I have also attached an image of a button I crafted to show you how it should look. Below this I will also provide a detailed spec of a CSS style I use called "Electric Glass" for insight and inspiration as you craft your version on the browser extension.

---

## Electric Glass

## 1. Core Philosophy

The "Electric-Glass" theme is built on a dark, cyberpunk-inspired aesthetic. It combines principles of glassmorphism with a vibrant, glowing cyan accent to create a futuristic and visually engaging interface. The key goals are depth, clarity, and interactivity, making the UI feel both sophisticated and responsive.

## 2. Color Palette

The palette is intentionally limited to create a high-contrast, focused look.

| Role                   | Hex Code           | Tailwind/CSS Usage                                   | Description                                                                    |
| ---------------------- | ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Deep Background**    | `#0A0F1A`          | `bg-[#0A0F1A]` on `<body>`                           | A very dark, slightly blue-tinted grey. Serves as the base canvas.             |
| **Primary Panel/Card** | `#101827`          | `bg-[#101827]`                                       | A slightly lighter dark blue, used for primary containers and panels.          |
| **Accent Panel**       | `#070B14`          | `bg-[#070B14]`                                       | An even darker, richer blue used for input fields and nested panels for depth. |
| **Bright Cyan (Glow)** | `#15fafa`          | `text-[#15fafa]`, `border-[#15fafa]`, `ring-[#15fafa]` | The primary, high-energy accent for text, icons, borders, and focus rings.     |
| **Mid Cyan**           | `#15adad`          | `border-[#15adad]`                                   | A less intense cyan for secondary borders and gradients.                       |
| **Dark Cyan**          | `#157d7d`          | `bg-[#157d7d]`, `scrollbar-thumb`                     | Used for secondary buttons and scrollbar thumbs.                               |
| **Primary Text**       | `#e0ffff`          | `text-[#e0ffff]`                                     | A very light, almost white cyan for maximum readability on dark backgrounds.   |
| **Secondary Text**     | `#a0f0f0`          | `text-[#a0f0f0]`                                     | A softer cyan for labels, placeholders, and less critical text.                |
| **Tertiary Text**      | `#70c0c0`          | `text-[#70c0c0]`                                     | A muted cyan for subtle hints, timestamps, and footer text.                    |
| **Error/Danger**       | `red-400` to `900` | `bg-red-900/50`, `border-red-500/80`                 | Standard red tones for error states, with transparency to fit the theme.       |

## 3. Key Thematic Elements

### a. The "Glass" Effect

This is achieved by layering semi-transparent elements with subtle borders.

-   **Background**: Use a dark base (`bg-[#101827]`).
-   **Transparency**: For pop-ups or layered elements, use a background color with alpha transparency (e.g., `bg-[#101827]/80`).
-   **Blur**: Apply a backdrop blur to create the frosted glass look (`backdrop-blur-sm`).
-   **Border**: A thin, bright border (`border border-[#15adad]/60`) defines the "edge" of the glass pane, enhancing the effect.
-   **Example (Modal)**:
    ```html
    <div class="bg-[#101827]/80 backdrop-blur-sm border border-[#15fafa] rounded-lg">
      <!-- Content -->
    </div>
    ```

### b. The "Glow" Effect

The glow is created using carefully crafted box-shadow and text gradients.

-   **Interactive Glow**: Buttons, inputs, and cards have a large, soft box-shadow using a semi-transparent version of the main accent color.
-   **CSS**: `box-shadow: 0 4px 15px rgba(21, 250, 250, 0.2);`
-   **Tailwind**: `shadow-xl shadow-[#156464]/30` (using a darker cyan for a deeper shadow) and `hover:shadow-[#15fafa]/50` on hover for an intensified glow.
-   **Text Glow/Gradient**: Headlines and important text use a linear gradient to simulate a neon glow.
-   **CSS**:
    ```css
    background: linear-gradient(to right, #15fafa, #15adad, #157d7d);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    ```

### c. Interactivity and Transitions

User feedback is critical. All interactive elements have clear hover and focus states with smooth transitions.

-   **Transitions**: `transition-all duration-150` or `duration-200` is applied to all interactive elements.
-   **Hover**: Typically involves brightening the border (`hover:border-[#15fafa]/80`) and intensifying the shadow (`hover:shadow-lg hover:shadow-[#15fafa]/50`).
-   **Focus**: Uses a visible outline ring (`focus:outline-none focus:ring-2`) with the bright cyan color (`focus:ring-[#15fafa]`). An offset (`focus:ring-offset-2 focus:ring-offset-[#0A0F1A]`) ensures the ring is visible even against the element's own border.

## 4. Component-Specific Recipes

-   **Primary Buttons**:
    -   **Base**: Dark panel background (`bg-[#101827]`), cyan border (`border-[#15adad]/60`), cyan shadow.
    -   **Hover**: Brighter border, more intense shadow.
-   **Secondary Buttons**:
    -   **Base**: Solid dark cyan background (`bg-[#157d7d]`).
    -   **Hover**: Slightly lighter cyan background (`hover:bg-[#159a9a]`).
-   **Input Fields / Selects**:
    -   **Base**: Deep accent background (`bg-[#070B14]`), subtle cyan border (`border-[#15adad]/70`), secondary text color for placeholder.
    -   **Focus**: Bright cyan focus ring.
-   **Custom Scrollbar**:
    -   **Track**: Dark panel color (`#101827`).
    -   **Thumb**: Dark cyan (`#157d7d`) with a rounded radius.
    -   **Hover**: Bright cyan thumb (`#15fafa`).

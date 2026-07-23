import os
import collections
from PIL import Image, ImageFilter, ImageChops

def remove_dark_background(image_path, output_path, threshold=130):
    """
    Removes the dark background from an image using a border-seeded flood fill.
    It preserves dark colors inside the object (like cockpit or shadows) by only
    removing dark pixels connected to the image boundaries.
    """
    print(f"Processing: {image_path}")
    if not os.path.exists(image_path):
        print(f"File not found: {image_path}")
        return

    # Open image and convert to RGBA
    img = Image.open(image_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()

    # Create a mask image (1 for keep, 0 for remove)
    # Start by keeping everything
    mask = Image.new("L", (width, height), 255)
    mask_pixels = mask.load()

    # Queue for flood fill BFS
    queue = collections.deque()
    visited = set()

    # Seed the queue with all border pixels
    # Top and Bottom borders
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
        visited.add((x, 0))
        visited.add((x, height - 1))
    
    # Left and Right borders
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
        visited.add((0, y))
        visited.add((width - 1, y))

    # BFS Flood fill
    while queue:
        x, y = queue.popleft()
        r, g, b, a = pixels[x, y]
        
        # Calculate pixel intensity (luminance approximation)
        # If the pixel is dark enough, mark it as background (remove)
        # Note: We can tweak the sum of R+G+B threshold
        intensity = r + g + b
        
        if intensity < threshold:
            mask_pixels[x, y] = 0  # set mask to transparent
            
            # Check 4-connected neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in visited:
                        visited.add((nx, ny))
                        queue.append((nx, ny))

    # Smooth the mask edges (feathering) to avoid jagged borders
    # We blur the mask slightly to create soft edges
    smoothed_mask = mask.filter(ImageFilter.GaussianBlur(radius=1.5))
    
    # Apply mask back to image alpha channel
    r_chan, g_chan, b_chan, a_chan = img.split()
    new_alpha = ImageChops.multiply(a_chan, smoothed_mask)
    
    final_img = Image.merge("RGBA", (r_chan, g_chan, b_chan, new_alpha))
    
    # Crop transparent borders to clean up the image bounding box
    bbox = final_img.getbbox()
    if bbox:
        final_img = final_img.crop(bbox)
        
    final_img.save(output_path, "PNG")
    print(f"Saved transparent image to: {output_path}")

def main():
    assets_dir = "C:/VECTOR/projects/spaceship-gacha/assets"
    
    # Thresholds: can be customized per image if needed
    images_to_process = {
        "pedestal.png": 140,
        "ship_lv1.png": 130,
        "ship_lv2.png": 130,
        "ship_lv3.png": 130,
        "ship_lv4.png": 130,
        "ship_lv5.png": 130
    }
    
    for filename, thresh in images_to_process.items():
        file_path = os.path.join(assets_dir, filename)
        # Overwrite in-place
        remove_dark_background(file_path, file_path, threshold=thresh)

if __name__ == "__main__":
    main()

#!/bin/bash

###############################################################################
# BRESLEV BOOKS - IMAGE OPTIMIZATION SCRIPT
# Converts SVG images to optimized PNG and WebP formats
# Creates responsive image sets (400w, 800w, 1200w)
# Agent 8: Performance & Optimization
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SOURCE_DIR="./public/images"
OUTPUT_DIR="./public/images/products-optimized"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BRESLEV BOOKS - IMAGE OPTIMIZATION${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check for required tools
check_requirements() {
  echo -e "${BLUE}Checking requirements...${NC}"
  
  if ! command -v convert &> /dev/null; then
    echo -e "${RED}✗ ImageMagick (convert) not found${NC}"
    echo "  Install: brew install imagemagick"
    return 1
  fi

  if ! command -v cwebp &> /dev/null; then
    echo -e "${YELLOW}⚠ WebP tools (cwebp) not found - skipping WebP conversion${NC}"
    return 0
  fi

  echo -e "${GREEN}✓ All requirements met${NC}"
  return 0
}

# Optimize a single image
optimize_image() {
  local input_file="$1"
  local base_name=$(basename "$input_file" | sed 's/\.[^.]*$//')

  echo -e "${YELLOW}Processing: $base_name${NC}"

  # Detect image dimensions
  local width=$(identify -format "%w" "$input_file" 2>/dev/null || echo "800")
  local height=$(identify -format "%h" "$input_file" 2>/dev/null || echo "600")

  # Calculate responsive sizes
  local h400=$((400 * height / width))
  local h800=$((800 * height / width))
  local h1200=$((1200 * height / width))

  # Quality settings
  local jpg_quality=80
  local webp_quality=80

  # Convert to PNG (400w)
  echo -e "  ${BLUE}→${NC} Creating 400w PNG..."
  convert "$input_file" \
    -resize "400x${h400}" \
    -quality $jpg_quality \
    -background white -alpha remove \
    "$OUTPUT_DIR/${base_name}-400w.png" 2>/dev/null

  # Convert to PNG (800w)
  echo -e "  ${BLUE}→${NC} Creating 800w PNG..."
  convert "$input_file" \
    -resize "800x${h800}" \
    -quality $jpg_quality \
    -background white -alpha remove \
    "$OUTPUT_DIR/${base_name}-800w.png" 2>/dev/null

  # Convert to PNG (1200w)
  echo -e "  ${BLUE}→${NC} Creating 1200w PNG..."
  convert "$input_file" \
    -resize "1200x${h1200}" \
    -quality $jpg_quality \
    -background white -alpha remove \
    "$OUTPUT_DIR/${base_name}-1200w.png" 2>/dev/null

  # Convert to WebP if available
  if command -v cwebp &> /dev/null; then
    echo -e "  ${BLUE}→${NC} Creating WebP versions..."
    cwebp -q $webp_quality "$OUTPUT_DIR/${base_name}-400w.png" \
      -o "$OUTPUT_DIR/${base_name}-400w.webp" 2>/dev/null
    cwebp -q $webp_quality "$OUTPUT_DIR/${base_name}-800w.png" \
      -o "$OUTPUT_DIR/${base_name}-800w.webp" 2>/dev/null
    cwebp -q $webp_quality "$OUTPUT_DIR/${base_name}-1200w.png" \
      -o "$OUTPUT_DIR/${base_name}-1200w.webp" 2>/dev/null
  fi

  echo -e "  ${GREEN}✓ Completed${NC}"
  echo ""
}

# Main execution
main() {
  check_requirements || true
  echo ""

  # Find and process all SVG images
  local svg_count=0

  echo -e "${BLUE}Searching for SVG images...${NC}"
  if [ -d "$SOURCE_DIR/products" ]; then
    for svg_file in "$SOURCE_DIR"/products/*.svg; do
      if [ -f "$svg_file" ]; then
        ((svg_count++))
        optimize_image "$svg_file"
      fi
    done
  fi

  if [ -d "$SOURCE_DIR/hero" ]; then
    for svg_file in "$SOURCE_DIR"/hero/*.svg; do
      if [ -f "$svg_file" ]; then
        ((svg_count++))
        optimize_image "$svg_file"
      fi
    done
  fi

  if [ $svg_count -eq 0 ]; then
    echo -e "${YELLOW}No SVG files found in $SOURCE_DIR${NC}"
    echo "Expected structure:"
    echo "  $SOURCE_DIR/products/*.svg"
    echo "  $SOURCE_DIR/hero/*.svg"
    return 1
  fi

  # Summary
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${GREEN}✓ OPTIMIZATION COMPLETE${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "Processed: ${GREEN}$svg_count${NC} images"
  echo -e "Output directory: ${YELLOW}$OUTPUT_DIR${NC}"
  echo ""
  echo -e "${BLUE}Files created:${NC}"
  ls -lh "$OUTPUT_DIR" | tail -n +2 | wc -l | xargs echo "  Total images:"
  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo "1. Review generated PNG/WebP files"
  echo "2. Use in Liquid templates with <picture> tags"
  echo "3. Update image references to use lazy loading"
  echo "4. Run Lighthouse to verify performance gains"
  echo ""
}

# Run main function
main

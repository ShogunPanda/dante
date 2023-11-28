use std::collections::{HashMap, HashSet};

use js_sys::{Array, JsString, Map, Set};
use lol_html::{element, HtmlRewriter, Settings};
use regex::Regex;
use scraper::{Html, Selector};
use wasm_bindgen::prelude::*;

const CSS_CLASS_ALPHABET: [char; 26] = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w',
  'x', 'y', 'z',
];
const CSS_CLASS_ALPHABET_LENGTH: i32 = 26;

fn import_array(source: &Array) -> Vec<String> {
  let mut destination = Vec::new();

  for value in source.iter() {
    destination.push(value.as_string().unwrap());
  }

  destination
}

fn import_map(source: &Map) -> HashMap<String, String> {
  let mut destination = HashMap::new();

  for value in source.entries() {
    let array: Array = value.unwrap().into();
    destination.insert(array.at(0).as_string().unwrap(), array.at(1).as_string().unwrap());
  }

  destination
}

fn import_set(source: &Set) -> HashSet<String> {
  let mut destination = HashSet::new();

  for value in source.entries() {
    destination.insert(value.unwrap().as_string().unwrap());
  }

  destination
}

fn export_vec(source: &Vec<String>) -> Array {
  let destination = Array::new();

  for value in source {
    destination.push(&JsValue::from(value));
  }

  destination
}

fn export_map(source: &HashMap<String, String>, destination: &Map) {
  for (key, value) in source {
    destination.set(&JsValue::from(key), &JsValue::from(value));
  }
}

fn generate_css_class(counter: &mut i32, prefix: &String) -> String {
  let mut name: String;

  loop {
    *counter += 1;
    let mut i = *counter;
    let mut partial: String = String::new();

    while i >= 1 {
      let mut index = i % CSS_CLASS_ALPHABET_LENGTH;
      i = i / CSS_CLASS_ALPHABET_LENGTH;

      if index - 1 == -1 {
        index = CSS_CLASS_ALPHABET_LENGTH;
        i -= 1;
      }

      partial = format!("{}{}", CSS_CLASS_ALPHABET[(index - 1) as usize], partial);
    }

    name = format!("{}{}", prefix, partial);

    if name != "ad" {
      break;
    }
  }

  name
}

fn compress_css_classes_internal(
  expanded: &Vec<String>,
  compressed: &mut HashMap<String, String>,
  layers: &HashMap<String, String>,
  safelist: &HashSet<String>,
  counter: &mut i32,
  prefix: &String,
) -> Vec<String> {
  let mut klasses = Vec::new();

  for klass in expanded {
    // Safelist, leave untouched
    if safelist.contains(klass) {
      klasses.push(klass.clone());
      compressed.insert(klass.clone(), klass.clone());
    } else {
      // Never encountered, generate a new class
      if !compressed.contains_key(klass) {
        // Generate the class
        let name = generate_css_class(counter, &prefix);

        // Find and replace the layer if needed
        let mut layer = String::new();

        if let Some(layer_index) = klass.find("@") {
          layer = klass[0..layer_index].to_string();

          if let Some(compressed_layer) = layers.get(&layer) {
            layer = compressed_layer.to_string();
          }

          layer.push_str("@");
        }

        // Set the final class
        compressed.insert(klass.clone(), format!("{}{}", layer, name));
      }

      // Perform the substitution
      klasses.push(compressed.get(klass).unwrap().clone());
    }
  }

  klasses
}

#[wasm_bindgen(js_name = "extractCSSClasses")]
pub fn extract_css_class(set: Set, html: &str) {
  let document = Html::parse_document(html);
  let selector = Selector::parse("[class]").unwrap();

  for element in document.select(&selector) {
    let attr = element.attr("class");

    if let Some(klasses) = attr {
      for klass in klasses.split(" ") {
        let trimmed = klass.trim();

        if !trimmed.is_empty() {
          set.add(&JsValue::from(trimmed));
        }
      }
    }
  }
}

#[wasm_bindgen(js_name = "extractImages")]
pub fn extract_images(html: &str) -> Vec<JsString> {
  let document = Html::parse_document(html);
  let selector = Selector::parse("img[src]").unwrap();
  let mut images = vec![];

  for element in document.select(&selector) {
    let attr = element.attr("src");

    if let Some(image) = attr {
      images.push(image.into());
    }
  }

  images
}

#[wasm_bindgen(js_name = "compressCSSClasses")]
pub fn compress_css_classes(
  expanded: &Array,
  compressed: &Map,
  layers: &Map,
  safelist: &Set,
  counter: i32,
  prefix: String,
) -> Array {
  let expanded = import_array(expanded);
  let mut compressed_internal = import_map(compressed);
  let layers = import_map(layers);
  let safelist = import_set(safelist);
  let mut counter = counter;

  let klasses = compress_css_classes_internal(
    &expanded,
    &mut compressed_internal,
    &layers,
    &safelist,
    &mut counter,
    &prefix,
  );

  // Put the data back in the compressed map
  export_map(&compressed_internal, compressed);

  // Return the classes and the updated counter
  let array = export_vec(&klasses);
  array.unshift(&JsValue::from(counter));
  array
}

#[wasm_bindgen(js_name = "compressCSSClassesInHTML")]
pub fn compress_css_classes_html(
  html: &str,
  compressed: &Map,
  layers: &Map,
  safelist: &Set,
  counter: i32,
  prefix: String,
) -> Array {
  let mut output = vec![];
  let mut compressed_internal = import_map(compressed);
  let layers = import_map(layers);
  let safelist = import_set(safelist);
  let mut counter = counter;
  let splitter = Regex::new(r"\s+").unwrap();

  // Perform the replacement of the classes
  let mut rewriter = HtmlRewriter::new(
    Settings {
      element_content_handlers: vec![element!("[class]", |el| {
        let klass = el.get_attribute("class").unwrap();
        let expanded: Vec<_> = splitter.split(&klass).map(|x| x.trim().to_string()).collect();

        let klasses = compress_css_classes_internal(
          &expanded,
          &mut compressed_internal,
          &layers,
          &safelist,
          &mut counter,
          &prefix,
        );
        let _ = el.set_attribute("class", klasses.join(" ").as_str());
        Ok(())
      })],
      ..Settings::default()
    },
    |c: &[u8]| output.extend_from_slice(c),
  );

  let _ = rewriter.write(html.as_bytes());
  let _ = rewriter.end();

  // Put the data back in the compressed map
  export_map(&compressed_internal, compressed);

  // Return the classes and the updated counter
  let array = Array::new();
  array.push(&JsValue::from(counter));
  array.push(&JsString::from(String::from_utf8(output).unwrap()));
  array
}

#[wasm_bindgen]
extern "C" {
  #[wasm_bindgen(js_namespace = console)]
  fn log(s: &str);
}

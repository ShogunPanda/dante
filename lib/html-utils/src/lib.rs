use js_sys::{JsString, Set};
use scraper::{Html, Selector};
use wasm_bindgen::prelude::*;

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

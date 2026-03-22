import os
import sys
import numpy as np
import tensorflow as tf

def load_labels():
    labels_path = os.path.join(os.path.dirname(__file__), "label_mapping.txt")
    id_to_disease = {}
    with open(labels_path, "r") as f:
        for line in f:
            disease, idx = line.strip().split(":")
            id_to_disease[int(idx)] = disease
    return id_to_disease

def test_image(image_path):
    model_path = os.path.join(os.path.dirname(__file__), "mobilenet_general_disease.keras")
    
    if not os.path.exists(model_path):
        print("Model file not found. Ensure you have run train.py first.")
        return

    # Load model and labels
    model = tf.keras.models.load_model(model_path)
    id_to_disease = load_labels()

    # Preprocess image
    img = tf.keras.utils.load_img(image_path, target_size=(224, 224))
    img_array = tf.keras.utils.img_to_array(img)
    img_array = tf.expand_dims(img_array, 0) # Create batch axis
    img_array = tf.keras.applications.mobilenet_v2.preprocess_input(img_array)

    # Predict
    predictions = model.predict(img_array)
    predicted_idx = np.argmax(predictions[0])
    confidence = predictions[0][predicted_idx] * 100

    print(f"\nPrediction:  {id_to_disease[predicted_idx]}")
    print(f"Confidence:  {confidence:.2f}%")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_model.py <path_to_image>")
    else:
        test_image(sys.argv[1])
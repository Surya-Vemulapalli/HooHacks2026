import os
import glob
import numpy as np
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout, RandomFlip, RandomRotation, RandomZoom, RandomBrightness
from tensorflow.keras.models import Model
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
import ssl

# Create an SSL context that doesn't verify certificates
ssl._create_default_https_context = ssl._create_unverified_context

def get_disease_label(folder_name):
    # PlantVillage folders are typically named like "Apple___Apple_scab" or "Apple___healthy"
    # We want to ignore the plant type and focus on the disease state
    if "___" in folder_name:
        disease = folder_name.split("___")[-1].strip().lower()
    else:
        disease = folder_name.strip().lower()
    return disease

def load_data(data_dir):
    image_paths = []
    labels = []
    
    # Get all subdirectories
    classes = [d for d in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, d))]
    
    # Map raw plant___disease folder to just disease
    disease_to_id = {}
    current_id = 0
    
    for class_folder in classes:
        disease = get_disease_label(class_folder)
        if disease not in disease_to_id:
            disease_to_id[disease] = current_id
            current_id += 1
            
        class_path = os.path.join(data_dir, class_folder)
        for img_name in os.listdir(class_path):
            if img_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                image_paths.append(os.path.join(class_path, img_name))
                labels.append(disease_to_id[disease])
                
    print("Disease mappings:")
    for disease, idx in disease_to_id.items():
        print(f"  {disease}: {idx}")
        
    return image_paths, labels, disease_to_id

def process_path(file_path, label):
    img = tf.io.read_file(file_path)
    img = tf.image.decode_jpeg(img, channels=3)
    img = tf.image.resize(img, [224, 224])
    # Remove preprocess_input from here! Leave it as 0-255.
    return img, label

def create_dataset(image_paths, labels, batch_size=32):
    dataset = tf.data.Dataset.from_tensor_slices((image_paths, labels))
    dataset = dataset.map(process_path, num_parallel_calls=tf.data.AUTOTUNE)
    dataset = dataset.shuffle(buffer_size=1000)
    dataset = dataset.batch(batch_size)
    dataset = dataset.prefetch(tf.data.AUTOTUNE)
    return dataset

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data", "plantvillage dataset", "color")
    
    if not os.path.exists(data_dir):
        print(f"Data directory not found: {data_dir}")
        return

    print("Loading image paths and resolving general disease labels...")
    image_paths, labels, disease_to_id = load_data(data_dir)
    num_classes = len(disease_to_id)
    
    print(f"Total images found: {len(image_paths)}")
    print(f"Total unique disease classes: {num_classes}")

    # Split data
    train_paths, val_paths, train_labels, val_labels = train_test_split(
        image_paths, labels, test_size=0.2, random_state=42, stratify=labels)

    train_ds = create_dataset(train_paths, train_labels)
    val_ds = create_dataset(val_paths, val_labels)

    # Build data augmentation pipeline
    data_augmentation = tf.keras.Sequential([
        RandomFlip("horizontal_and_vertical"),
        RandomRotation(0.2),
        RandomZoom(0.2),
        RandomBrightness(0.2),
    ], name="data_augmentation")

    # Build model using MobileNetV2
    print("Building MobileNetV2 model with fine-tuning...")
    base_model = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
    
    # Freeze the base model first
    base_model.trainable = False

    # Create the model architecture
    inputs = tf.keras.Input(shape=(224, 224, 3))
    x = data_augmentation(inputs) # Apply augmentation during training on 0-255 images
    
    # Scale to [-1, 1] AFTER augmentation, right before the base model
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x) 
    
    x = base_model(x, training=False)
    x = GlobalAveragePooling2D()(x)
    x = Dropout(0.5)(x) # Increased dropout for better regularization
    predictions = Dense(num_classes, activation='softmax')(x)

    model = Model(inputs=inputs, outputs=predictions)

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001), 
                  loss='sparse_categorical_crossentropy', 
                  metrics=['accuracy'])

    # Callbacks for better training
    early_stop = EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)
    reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=2, min_lr=1e-6)

    # Phase 1: Train just the top classification head
    print("Phase 1: Training top layers...")
    model.fit(train_ds, validation_data=val_ds, epochs=5, callbacks=[early_stop])

    # Phase 2: Fine-tuning
    print("Phase 2: Fine-tuning the top convolutional blocks of MobileNetV2...")
    base_model.trainable = True
    # Freeze the bottom 100 layers, train the rest
    for layer in base_model.layers[:100]:
        layer.trainable = False

    # Recompile with a much lower learning rate for fine-tuning
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5), 
                  loss='sparse_categorical_crossentropy', 
                  metrics=['accuracy'])

    model.fit(train_ds, validation_data=val_ds, epochs=10, callbacks=[early_stop, reduce_lr])

    # Save model using the newer .keras format
    model_save_path = os.path.join(os.path.dirname(__file__), "mobilenet_general_disease.keras")
    model.save(model_save_path)
    print(f"Model successfully saved to {model_save_path}")
    
    # Save the label mapping as well
    with open(os.path.join(os.path.dirname(__file__), "label_mapping.txt"), "w") as f:
        for disease, idx in disease_to_id.items():
            f.write(f"{disease}:{idx}\n")

if __name__ == '__main__':
    main()

## Deployment on the Cloud ##
gcloud compute scp --recurse . kuthankukrer@hoosleaf:~/app --zone=YOUR_ZONE
gcloud compute ssh kuthankukrer@hoosleaf --zone=YOUR_ZONE
cd ~/app
docker compose up --build -d
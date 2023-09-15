##
## digiserve/ab-appbuilder:master
##
## This is our microservice for our AppBuilder CRUD operations.
##
## Docker Commands:
## ---------------
## $ docker build -t digiserve/ab-appbuilder:master .
## $ docker push digiserve/ab-appbuilder:master
##

ARG BRANCH=master

FROM digiserve/service-cli:${BRANCH}

COPY . /app

WORKDIR /app

RUN npm i -f

WORKDIR /app/AppBuilder

RUN npm i -f

WORKDIR /app

CMD [ "node", "--inspect=0.0.0.0:9229", "--max-old-space-size=8192", "--stack-size=8192", "app.js" ]

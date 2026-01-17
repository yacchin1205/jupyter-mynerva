FROM quay.io/jupyter/base-notebook:latest

RUN mamba install -y nodejs=22

COPY --chown=${NB_UID}:${NB_GID} . /home/${NB_USER}/jupyter-mynerva

RUN pip install /home/${NB_USER}/jupyter-mynerva

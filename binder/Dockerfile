FROM quay.io/jupyter/base-notebook:latest

COPY --chown=${NB_UID}:${NB_GID} . /home/${NB_USER}/jupyter-mynerva

RUN pip install /home/${NB_USER}/jupyter-mynerva

import os
import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

import tornado
from tornado.web import StaticFileHandler

from .main import main

class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def post(self):
        # input_data is a dictionary with a key "name"
        input_data = self.get_json_body()
        # TODO: how to get server root path
        input_file_name = input_data["name"]
        abs_file_path = os.path.join(os.getcwd(), input_file_name)
        main(abs_file_path)
        data = {"greetings": "Hello {}, enjoy JupyterLab!".format(abs_file_path)}
        self.finish(json.dumps(data))


def setup_handlers(web_app):
    host_pattern = ".*$"
    url_path = "data-leakage-detection"

    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(base_url, url_path, "detect")
    handlers = [(route_pattern, RouteHandler)]
    web_app.add_handlers(host_pattern, handlers)

    doc_url = url_path_join(base_url, url_path, "public")
    doc_dir = os.getenv(
        "JLAB_SERVER_EXAMPLE_STATIC_DIR",
        os.path.join(os.path.dirname(__file__), "public"),
    )
    handlers = [("{}/(.*)".format(doc_url), StaticFileHandler, {"path": doc_dir})]  # local root dir of content
    web_app.add_handlers(".*$", handlers)

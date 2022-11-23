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
        input_file_name = input_data["name"]
        abs_file_path = os.path.join(os.getcwd(), input_file_name)
        # check file type
        analysis_path = abs_file_path
        file_prefix, file_suffix = os.path.splitext(input_file_name)
        if file_suffix == '.ipynb':
            # generate a temporary script file from notebook
            # TODO: if name is occupied, nbconvert seems not generating
            # Or "python3 -m jupyter ..."
            os.system(f"jupyter nbconvert --to script {abs_file_path}")  # TODO: if failed
            analysis_path = os.path.join(os.getcwd(), file_prefix) + '.py'
        result = main(analysis_path)

        def ipynb_line_transform(report, file_path):  # transform 1-indiced line_no to cell_no and line_no
            lines = []
            with open(file_path) as file:
                for line in file:
                    lines.append(line.rstrip())
            # get the line_no of "# In[..." following with 2 "\n" in py file
            splits = []
            for i in range(len(lines)):
                if lines[i][:5] == "# In[" and i + 2 < len(lines) and\
                lines[i + 1] == "" and lines[i + 2] == "":
                    splits.append(i + 1)  # 1-indiced
            for entry in report:
                # entry is like: {'Line': 18, 'Label': 'train', 'Tags': [{'Tag': 'train-test', 'Source': [18, 19]}]}
                def line2cell(splits, lineno):
                    for i in range(len(splits)):
                        if lineno < splits[i]:
                            return i - 1, lineno - splits[i - 1] - 3
                    return len(splits) - 1, lineno - splits[-1] - 3
                cell, line = line2cell(splits, entry['Line'])
                entry['Location'] = {'Cell': cell, 'Line': line}
                for tag in entry['Tags']:
                    sources = []
                    for source in tag['Source']:
                        cell, line = line2cell(splits, source)
                        sources.append({'Cell': cell, 'Line': line})
                    tag['Source'] = sources
            return report, splits

        data = {'ok': False, 'report': [], 'log': ''}
        if not isinstance(result, str):  # if no error
            #report_file_name = file_prefix + '.html'
            if file_suffix == '.ipynb':
                result, splits = ipynb_line_transform(result, analysis_path)
            data['ok'] = True
            data['report'] = result
            data['log'] = splits
            # if file_suffix == '.ipynb':
            #     os.remove(analysis_path)
        self.finish(json.dumps(data))


def setup_handlers(web_app):
    host_pattern = ".*$"
    url_path = "data-leakage-detection"

    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(base_url, url_path, "detect")
    handlers = [(route_pattern, RouteHandler)]
    web_app.add_handlers(host_pattern, handlers)

    doc_url = url_path_join(base_url, url_path, "report")
    doc_dir = os.getcwd()
    handlers = [("{}/(.*)".format(doc_url), StaticFileHandler, {"path": doc_dir})]  # local root dir of content
    web_app.add_handlers(".*$", handlers)
